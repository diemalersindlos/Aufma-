"use client";

import { AlertTriangle, Bluetooth, Check, LoaderCircle, Radio, RotateCcw, Unplug } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import MobileVoiceInput from "@/components/mobile-voice-input";
import {
  decodeLaserMeasurement,
  LASER_BLE_PROFILES,
  LASER_SEQUENCE,
  laserValue,
  nextLaserTarget,
  hasCompleteLaserSequence,
  type LaserMeasurementRecord,
  type LaserMeasureTarget,
  type LaserMeasurementSource,
} from "@/lib/bluetooth-laser";

type BluetoothCharacteristicLike = EventTarget & {
  value?: DataView;
  properties: { notify?: boolean; indicate?: boolean };
  startNotifications: () => Promise<BluetoothCharacteristicLike>;
};

type BluetoothServiceLike = {
  getCharacteristic: (uuid: string) => Promise<BluetoothCharacteristicLike>;
};

type BluetoothServerLike = {
  connected: boolean;
  connect: () => Promise<BluetoothServerLike>;
  disconnect: () => void;
  getPrimaryService: (uuid: string) => Promise<BluetoothServiceLike>;
};

type BluetoothDeviceLike = EventTarget & {
  name?: string;
  gatt?: BluetoothServerLike;
};

type BluetoothNavigator = Navigator & {
  bluetooth?: {
    requestDevice: (options: { acceptAllDevices: boolean; optionalServices: string[] }) => Promise<BluetoothDeviceLike>;
  };
};

type NativeLaserBridge = { postMessage: (message: unknown) => void };
type NativeLaserWindow = Window & {
  webkit?: { messageHandlers?: { laserBluetooth?: NativeLaserBridge } };
};

type LaserStatus = "idle" | "connecting" | "connected" | "unsupported" | "error";

type MobileLaserCaptureProps = {
  values: Record<LaserMeasureTarget, string>;
  records: LaserMeasurementRecord[];
  deviceName: string;
  onValue: (target: LaserMeasureTarget, value: string) => void;
  onRecordsChange: (records: LaserMeasurementRecord[]) => void;
  onDeviceName: (name: string) => void;
};

function numberValue(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function nativeBridge() {
  if (typeof window === "undefined") return undefined;
  return (window as NativeLaserWindow).webkit?.messageHandlers?.laserBluetooth;
}

function supportsDirectBluetooth() {
  if (typeof navigator === "undefined") return false;
  return Boolean((navigator as BluetoothNavigator).bluetooth || nativeBridge());
}

export default function MobileLaserCapture({ values, records, deviceName, onValue, onRecordsChange, onDeviceName }: MobileLaserCaptureProps) {
  const deviceRef = useRef<BluetoothDeviceLike | null>(null);
  const characteristicRef = useRef<BluetoothCharacteristicLike | null>(null);
  const notificationHandlerRef = useRef<((event: Event) => void) | null>(null);
  const lastPacketRef = useRef<{ meters: number; receivedAt: number } | null>(null);
  const activeTargetRef = useRef<LaserMeasureTarget>("length");
  const recordsRef = useRef(records);
  const callbacksRef = useRef({ onValue, onRecordsChange, onDeviceName });

  const [activeTarget, setActiveTarget] = useState<LaserMeasureTarget>("length");
  const [status, setStatus] = useState<LaserStatus>("idle");
  const [error, setError] = useState("");
  const [lastMeasurement, setLastMeasurement] = useState<LaserMeasurementRecord | null>(null);
  const directBluetooth = supportsDirectBluetooth();
  const sequenceComplete = hasCompleteLaserSequence(records);

  const chooseTarget = useCallback(function chooseTarget(target: LaserMeasureTarget) {
    activeTargetRef.current = target;
    setActiveTarget(target);
    setError("");
  }, []);

  const storeMeasurement = useCallback(function storeMeasurement(meters: number, source: LaserMeasurementSource, raw?: string) {
    if (!Number.isFinite(meters) || meters <= 0 || meters > 250) {
      setError("Der empfangene Laserwert ist unplausibel und wurde nicht übernommen.");
      return;
    }
    const now = Date.now();
    if (lastPacketRef.current && Math.abs(lastPacketRef.current.meters - meters) < 0.00001 && now - lastPacketRef.current.receivedAt < 800) return;
    lastPacketRef.current = { meters, receivedAt: now };
    const target = activeTargetRef.current;
    const record: LaserMeasurementRecord = { target, meters, receivedAt: new Date().toISOString(), source, raw };
    const nextRecords = [...recordsRef.current.filter((item) => item.target !== target), record];
    recordsRef.current = nextRecords;
    callbacksRef.current.onRecordsChange(nextRecords);
    callbacksRef.current.onValue(target, laserValue(meters));
    setLastMeasurement(record);
    setError("");
    chooseTarget(nextLaserTarget(target));
  }, [chooseTarget]);

  const handlePayload = useCallback(function handlePayload(payload: ArrayBuffer | ArrayBufferView | string, source: LaserMeasurementSource) {
    const decoded = decodeLaserMeasurement(payload);
    if (!decoded) {
      setError("Ein Bluetooth-Signal wurde empfangen, der Messwert konnte aber nicht erkannt werden. Für dieses Gerät wird ein Herstellerprofil benötigt.");
      return;
    }
    storeMeasurement(decoded.meters, source, decoded.raw);
  }, [storeMeasurement]);

  const disconnect = useCallback(function disconnect(updateStatus = true) {
    if (characteristicRef.current && notificationHandlerRef.current) characteristicRef.current.removeEventListener("characteristicvaluechanged", notificationHandlerRef.current);
    characteristicRef.current = null;
    notificationHandlerRef.current = null;
    if (deviceRef.current?.gatt?.connected) deviceRef.current.gatt.disconnect();
    deviceRef.current = null;
    if (updateStatus) setStatus("idle");
  }, []);

  async function connect() {
    setError("");
    setStatus("connecting");
    const bridge = nativeBridge();
    if (bridge) {
      bridge.postMessage({ action: "connect", sequence: LASER_SEQUENCE.map((step) => step.target) });
      return;
    }

    const bluetooth = (navigator as BluetoothNavigator).bluetooth;
    if (!bluetooth) {
      setStatus("unsupported");
      setError("Dieser Browser kann Bluetooth-Laser nicht direkt ansprechen. Bitte Handeingabe verwenden oder die native App-Verbindung nutzen.");
      return;
    }

    try {
      const device = await bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: LASER_BLE_PROFILES.map((profile) => profile.service),
      });
      deviceRef.current = device;
      const server = await device.gatt?.connect();
      if (!server) throw new Error("Das Gerät stellt keine Bluetooth-Messverbindung bereit.");

      let characteristic: BluetoothCharacteristicLike | null = null;
      for (const profile of LASER_BLE_PROFILES) {
        try {
          const service = await server.getPrimaryService(profile.service);
          const candidate = await service.getCharacteristic(profile.characteristic);
          if (candidate.properties.notify || candidate.properties.indicate) {
            characteristic = candidate;
            break;
          }
        } catch {
          // Try the next supported serial profile.
        }
      }
      if (!characteristic) throw new Error("Gerät gekoppelt, aber kein unterstützter Messkanal erkannt. Bitte Hersteller und Lasermodell mitteilen.");

      const notificationHandler = (event: Event) => {
        const value = (event.target as BluetoothCharacteristicLike).value;
        if (value) handlePayload(value, "bluetooth");
      };
      notificationHandlerRef.current = notificationHandler;
      characteristicRef.current = characteristic;
      characteristic.addEventListener("characteristicvaluechanged", notificationHandler);
      await characteristic.startNotifications();
      const connectedName = device.name?.trim() || "Bluetooth-Laser";
      callbacksRef.current.onDeviceName(connectedName);
      device.addEventListener("gattserverdisconnected", () => setStatus("idle"), { once: true });
      setStatus("connected");
    } catch (cause) {
      disconnect(false);
      if (cause instanceof DOMException && cause.name === "NotFoundError") {
        setStatus("idle");
        setError("Geräteauswahl wurde abgebrochen.");
      } else {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Der Bluetooth-Laser konnte nicht verbunden werden.");
      }
    }
  }

  function correctValue(target: LaserMeasureTarget, value: string) {
    callbacksRef.current.onValue(target, value);
    const meters = numberValue(value);
    const previous = recordsRef.current.find((record) => record.target === target);
    const nextRecords = recordsRef.current.filter((record) => record.target !== target);
    if (meters > 0) nextRecords.push({
      target,
      meters,
      receivedAt: new Date().toISOString(),
      source: "manual-correction",
      originalMeters: previous?.source === "manual-correction" ? previous.originalMeters : previous?.meters,
    });
    recordsRef.current = nextRecords;
    callbacksRef.current.onRecordsChange(nextRecords);
    chooseTarget(target);
  }

  function resetSequence() {
    LASER_SEQUENCE.forEach(({ target }) => callbacksRef.current.onValue(target, ""));
    recordsRef.current = [];
    callbacksRef.current.onRecordsChange([]);
    setLastMeasurement(null);
    lastPacketRef.current = null;
    chooseTarget("length");
  }

  useEffect(() => {
    recordsRef.current = records;
    callbacksRef.current = { onValue, onRecordsChange, onDeviceName };
  }, [onDeviceName, onRecordsChange, onValue, records]);

  useEffect(() => {
    const measurementListener = (event: Event) => {
      const detail = (event as CustomEvent<{ meters?: number; raw?: string }>).detail;
      if (detail?.meters !== undefined) storeMeasurement(detail.meters, "native", detail.raw);
      else if (detail?.raw) handlePayload(detail.raw, "native");
    };
    const statusListener = (event: Event) => {
      const detail = (event as CustomEvent<{ connected?: boolean; deviceName?: string; error?: string }>).detail;
      if (detail?.deviceName) callbacksRef.current.onDeviceName(detail.deviceName);
      if (detail?.error) {
        setStatus("error");
        setError(detail.error);
      } else if (detail?.connected) setStatus("connected");
      else setStatus("idle");
    };
    window.addEventListener("maleraufmass:laser-measurement", measurementListener);
    window.addEventListener("maleraufmass:laser-status", statusListener);
    return () => {
      window.removeEventListener("maleraufmass:laser-measurement", measurementListener);
      window.removeEventListener("maleraufmass:laser-status", statusListener);
      disconnect(false);
    };
  }, [disconnect, handlePayload, storeMeasurement]);

  return <div className="mobile-laser-capture">
    <div className="mobile-laser-connect">
      <span className={status === "connected" ? "connected" : ""}><i><Bluetooth size={19} /></i><span><strong>{status === "connected" ? deviceName || "Bluetooth-Laser verbunden" : "Bluetooth-Laser verbinden"}</strong><small>{status === "connected" ? "Neue Messwerte werden automatisch übernommen." : "Laser einschalten und Bluetooth am Gerät aktivieren."}</small></span></span>
      {status === "connected" ? <button type="button" className="mobile-laser-disconnect" onClick={() => disconnect()}><Unplug size={15} /> Trennen</button> : <button type="button" className="mobile-laser-connect-button" onClick={() => void connect()} disabled={status === "connecting"}>{status === "connecting" ? <LoaderCircle className="spin" size={16} /> : <Bluetooth size={16} />} {status === "connecting" ? "Suche …" : "Verbinden"}</button>}
    </div>

    {!directBluetooth && <div className="mobile-laser-warning"><AlertTriangle size={16} /><span><strong>Bluetooth im Browser nicht verfügbar</strong><small>Auf diesem Gerät wird für die automatische Übernahme die native App-Verbindung benötigt. Alternativ oben auf Handeingabe wechseln.</small></span></div>}
    {error && <div className="mobile-laser-warning error"><AlertTriangle size={16} /><span><strong>Laser-Hinweis</strong><small>{error}</small></span></div>}

    <div className="mobile-laser-sequence-head"><span><Radio size={16} /><strong>Messfolge: Länge → Breite → Höhe</strong></span><button type="button" onClick={resetSequence}><RotateCcw size={14} /> Neu</button></div>
    <div className="mobile-laser-sequence">
      {LASER_SEQUENCE.map((step, index) => {
        const record = records.find((item) => item.target === step.target);
        const hasValue = numberValue(values[step.target]) > 0;
        const verified = Boolean(record && (record.source !== "manual-correction" || record.originalMeters !== undefined));
        return <div key={step.target} className={`${activeTarget === step.target ? "active" : ""} ${verified ? "complete" : ""}`}>
          <button type="button" onClick={() => chooseTarget(step.target)}><i>{verified ? <Check size={14} /> : index + 1}</i><span><strong>{step.label}</strong><small>{activeTarget === step.target && !verified ? "Jetzt mit Laser messen" : verified ? record?.source === "manual-correction" ? "Laserwert korrigiert" : "vom Laser empfangen" : hasValue ? "Laserwert fehlt noch" : "noch offen"}</small></span></button>
          <label><span className="sr-only">{step.label} in Metern</span><input inputMode="decimal" value={values[step.target]} onFocus={() => chooseTarget(step.target)} onChange={(event) => correctValue(step.target, event.target.value)} placeholder="0,00" /><MobileVoiceInput label={`${step.label} korrigieren`} kind="measurement" onValue={(value) => correctValue(step.target, value)} /><i>m</i></label>
        </div>;
      })}
    </div>
    <div className={`mobile-laser-live ${status === "connected" || sequenceComplete ? "connected" : ""}`}><Radio size={16} /><span><strong>{sequenceComplete ? "Messfolge vollständig" : status === "connected" ? `${LASER_SEQUENCE.find((step) => step.target === activeTarget)?.label} messen` : "Bereit für die Messfolge"}</strong><small>{lastMeasurement ? `Zuletzt empfangen: ${laserValue(lastMeasurement.meters)} m` : "Aktives Feld antippen; jeder Laserwert rückt automatisch zum nächsten Maß weiter."}</small></span><em>{sequenceComplete ? "FERTIG" : status === "connected" ? "LIVE" : "WARTET"}</em></div>
  </div>;
}
