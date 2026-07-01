import { CustomerDisplay } from "../../[token]/customer-display";

type CustomerTerminalDisplayPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CustomerTerminalDisplayPage({
  params,
}: CustomerTerminalDisplayPageProps) {
  const { token } = await params;

  return <CustomerDisplay mode="terminal" token={token} />;
}
