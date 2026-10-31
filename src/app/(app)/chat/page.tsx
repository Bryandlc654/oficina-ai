import { PageHeader } from "@/components/ui";
import { GROUP_CHANNEL, listChannelMessages, listChatAgents } from "@/lib/services/chat";
import { ChatView } from "./chat-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat" };

export default async function ChatPage() {
  const [agents, messages] = await Promise.all([listChatAgents(), listChannelMessages(GROUP_CHANNEL)]);

  return (
    <div>
      <PageHeader
        eyebrow="Equipo"
        title="Chat"
        description="Habla con todo el equipo en el canal general (usa @ para mencionar a alguien o @todos) o abre una conversación privada con cada empleado."
      />
      <ChatView agents={agents} initialMessages={JSON.parse(JSON.stringify(messages))} />
    </div>
  );
}
