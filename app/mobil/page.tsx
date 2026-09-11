import MobileMeasureApp from "@/components/mobile-measure-app";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import "./mobile.css";

export const dynamic = "force-dynamic";

export default async function MobilePage() {
  await requireChatGPTUser("/mobil");
  return <MobileMeasureApp />;
}
