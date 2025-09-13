import { PipedreamClient } from '@pipedream/sdk';

let pd: PipedreamClient | null = null;

const getPipedreamClient = (): PipedreamClient => {
  if (!pd) {
    const clientId = process.env.PIPEDREAM_CLIENT_ID;
    const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET;
    const projectEnvironment = process.env.PIPEDREAM_ENVIRONMENT;
    const projectId = process.env.PIPEDREAM_PROJECT_ID;

    if (!clientId || !clientSecret || !projectId) {
      throw new Error(
        'Pipedream configuration missing. Please set PIPEDREAM_CLIENT_ID, PIPEDREAM_CLIENT_SECRET, and PIPEDREAM_PROJECT_ID environment variables.'
      );
    }

    pd = new PipedreamClient({
      clientId,
      clientSecret,
      projectEnvironment: projectEnvironment as any,
      projectId,
    });
  }
  return pd;
};

export { getPipedreamClient };
