import { CustomerDisplay } from "./customer-display";

type CustomerDisplayPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function CustomerDisplayPage({
  params,
}: CustomerDisplayPageProps) {
  const { token } = await params;

  return <CustomerDisplay token={token} />;
}
