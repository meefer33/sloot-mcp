import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import verifyJWT from './jwtAuth.js';
import { getServer } from './utils/getServer.js';
import {
  createListToolsHandler,
  setCurrentServerData as setListToolsData,
} from './handlers/listToolsHandler.js';
import {
  createCallToolHandler,
  setCurrentServerData as setCallToolData,
} from './handlers/callToolHandler.js';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Extend global type for OAuth storage
declare global {
  var clientRegistrations: Map<string, any>;
  var authCodes: Map<string, any>;
  var serverUserTokens: Map<string, string>;
}

const app = express();
app.use(express.json());

// Add CORS middleware before your MCP routes
app.use(
  cors({
    origin: '*', // Configure appropriately for production, for example:
    // origin: ['https://your-remote-domain.com', 'https://your-other-remote-domain.com'],
    exposedHeaders: ['Mcp-Session-Id'],
    allowedHeaders: ['Content-Type', 'mcp-session-id'],
  })
);

app.use(verifyJWT);
// Map to store transports by session ID
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Map to store pending initializations to avoid duplicate sessions
const pendingInitializations = new Set<string>();

// Create MCP server instance
const server = new Server(
  {
    name: 'sloot-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
    debouncedNotificationMethods: ['notifications/tools/list_changed'],
  }
);

// Set up server tools
server.setRequestHandler(ListToolsRequestSchema, createListToolsHandler());
server.setRequestHandler(CallToolRequestSchema, createCallToolHandler());

// OAuth 2.1 Authorization Server Metadata Discovery (RFC8414)
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;

  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'client_credentials'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
    scopes_supported: ['mcp_tools'],
    mcp_protocol_version: '2025-03-26',
  });
});

// OAuth 2.0 Dynamic Client Registration (RFC7591)
app.post('/register', (req, res) => {
  const { client_name, redirect_uris, grant_types, response_types } = req.body;

  // Generate client credentials
  const client_id = crypto.randomUUID();
  const client_secret = crypto.randomBytes(32).toString('hex');

  // Store client registration (in production, store in database)
  const clientRegistrations = global.clientRegistrations || new Map();
  clientRegistrations.set(client_id, {
    client_id,
    client_secret,
    client_name: client_name || 'MCP Client',
    redirect_uris: redirect_uris || ['http://localhost:3000/callback'],
    grant_types: grant_types || ['authorization_code'],
    response_types: response_types || ['code'],
    created_at: new Date().toISOString(),
  });
  global.clientRegistrations = clientRegistrations;

  res.status(201).json({
    client_id,
    client_secret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0, // No expiration
    client_name: client_name || 'MCP Client',
    redirect_uris: redirect_uris || ['http://localhost:3000/callback'],
    grant_types: grant_types || ['authorization_code'],
    response_types: response_types || ['code'],
  });
});

// OAuth 2.1 Authorization Endpoint
app.get('/authorize', (req, res) => {
  const {
    response_type,
    client_id,
    redirect_uri,
    scope,
    state,
    code_challenge,
    code_challenge_method,
    serverId,
  } = req.query;

  // Validate required parameters
  if (response_type !== 'code') {
    return res.status(400).json({
      error: 'unsupported_response_type',
      error_description: 'Only authorization code flow is supported',
    });
  }

  if (!client_id || !redirect_uri || !state) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameters',
    });
  }

  // Validate PKCE parameters
  if (!code_challenge || code_challenge_method !== 'S256') {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'PKCE code challenge required with S256 method',
    });
  }

  // Generate authorization code with PKCE
  const authCode = jwt.sign(
    {
      client_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      serverId,
      nonce: crypto.randomBytes(16).toString('hex'),
    },
    process.env.JWT_SECRET || 'slootai',
    { expiresIn: '10m' }
  );

  // Store authorization code for validation (in production, store in database)
  const authCodes = global.authCodes || new Map();
  authCodes.set(authCode, {
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    serverId,
    created_at: Date.now(),
  });
  global.authCodes = authCodes;

  // Redirect to your website's OAuth login page
  const loginUrl =
    `${process.env.FRONTEND_URL}/oauth/login?` +
    `auth_code=${authCode}&` +
    `client_id=${client_id}&` +
    `redirect_uri=${encodeURIComponent(redirect_uri as string)}&` +
    `state=${state}&` +
    `serverId=${serverId}`;

  res.redirect(loginUrl);
});

// OAuth 2.1 Token Endpoint
app.post('/token', async (req, res) => {
  const {
    grant_type,
    code,
    client_id,
    client_secret,
    redirect_uri,
    code_verifier,
  } = req.body;

  // Validate grant type
  if (grant_type !== 'authorization_code') {
    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code grant type is supported',
    });
  }

  try {
    // Verify authorization code
    const decoded = jwt.verify(
      code,
      process.env.JWT_SECRET || 'slootai'
    ) as any;

    // Validate PKCE code verifier
    const codeChallenge = crypto
      .createHash('sha256')
      .update(code_verifier)
      .digest('base64url');

    if (codeChallenge !== decoded.code_challenge) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid code verifier',
      });
    }

    // Validate client credentials
    const clientRegistrations = global.clientRegistrations || new Map();
    const client = clientRegistrations.get(client_id);

    if (!client) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Unknown client',
      });
    }

    if (client.client_secret && client.client_secret !== client_secret) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      });
    }

    // Clean up used authorization code
    const authCodes = global.authCodes || new Map();
    authCodes.delete(code);
    global.authCodes = authCodes;

    // Generate access token
    const accessToken = jwt.sign(
      {
        client_id: decoded.client_id,
        serverId: decoded.serverId,
        type: 'mcp_access_token',
        scope: 'mcp_tools',
      },
      process.env.JWT_SECRET || 'slootai',
      { expiresIn: '1h' }
    );

    // Generate refresh token
    const refreshToken = jwt.sign(
      {
        client_id: decoded.client_id,
        serverId: decoded.serverId,
        type: 'mcp_refresh_token',
      },
      process.env.JWT_SECRET || 'slootai',
      { expiresIn: '30d' }
    );

    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: 'mcp_tools',
    });
  } catch (error) {
    console.error('Token endpoint error:', error);
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid authorization code',
    });
  }
});

// OAuth callback endpoint (called after user authorizes on your website)
app.post('/oauth/callback', async (req, res) => {
  const { auth_code, user_token, serverId } = req.body;

  if (!auth_code || !user_token || !serverId) {
    return res.status(400).json({
      error: 'invalid_request',
      error_description: 'Missing required parameters',
    });
  }

  try {
    // Verify the authorization code
    const decoded = jwt.verify(
      auth_code,
      process.env.JWT_SECRET || 'slootai'
    ) as any;

    // Store the user token for this server (in production, store in database)
    const serverUserTokens = global.serverUserTokens || new Map();
    serverUserTokens.set(serverId, user_token);
    global.serverUserTokens = serverUserTokens;

    res.json({
      success: true,
      message: 'User token stored successfully',
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(400).json({
      error: 'invalid_grant',
      error_description: 'Invalid authorization code',
    });
  }
});

// OAuth-protected MCP endpoint
app.post('/mcp/:serverId', async (req: any, res) => {
  console.log('OAuth MCP request for serverId:', req.params.serverId);

  // Extract access token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'invalid_request',
      error_description: 'Missing or invalid authorization header',
    });
  }

  const accessToken = authHeader.substring(7);

  try {
    // Verify access token
    const decoded = jwt.verify(
      accessToken,
      process.env.JWT_SECRET || 'slootai'
    ) as any;

    if (decoded.type !== 'mcp_access_token') {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Invalid token type',
      });
    }

    // Get user token for this server
    const serverUserTokens = global.serverUserTokens || new Map();
    const userToken = serverUserTokens.get(req.params.serverId);

    if (!userToken) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description:
          'No user token found for this server. Please complete OAuth flow first.',
      });
    }

    // Get server data using the user token
    const { data, mcpToolData, mcpToolDataSchema }: any = await getServer(
      req.params.serverId,
      userToken
    );

    console.log('OAuth server data retrieved');
    if (data.error) {
      res.status(401).json({ error: true, message: 'Invalid server or token' });
      return;
    }

    // Set server data for use in MCP handlers
    setListToolsData(data, mcpToolDataSchema);
    setCallToolData(data, mcpToolData, mcpToolDataSchema, { token: userToken });

    // Check for existing session ID
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse existing transport
      console.log('OAuth: reuse existing transport');
      transport = transports[sessionId];
    } else if (!sessionId && req.body.method === 'initialize') {
      // New initialization request for OAuth
      const clientId = req.ip || 'unknown';

      if (pendingInitializations.has(clientId)) {
        console.log(
          'OAuth: Initialization already in progress for client:',
          clientId
        );
        res.status(202).json({
          jsonrpc: '2.0',
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
            serverInfo: {
              name: 'sloot-mcp-server-oauth',
              version: '1.0.0',
            },
          },
          id: req.body.id,
        });
        return;
      }

      // Mark this client as initializing
      pendingInitializations.add(clientId);

      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sessionId: string) => {
          transports[sessionId] = transport;
          console.log(`OAuth MCP session initialized: ${sessionId}`);
          pendingInitializations.delete(clientId);
        },
      });

      // Clean up transport when closed
      transport.onclose = () => {
        if (transport.sessionId) {
          console.log(`OAuth MCP session closed: ${transport.sessionId}`);
          delete transports[transport.sessionId];
        }
        pendingInitializations.delete(clientId);
      };

      // Connect the server to the transport
      await server.connect(transport);
    } else {
      // Invalid request
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    // Handle the request using the transport's request handler
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('Error handling OAuth MCP request:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error',
        },
        id: req.body.id || null,
      });
    }
  } catch (error) {
    console.error('Error in OAuth MCP request:', error);
    res.status(500).json({ error: true, message: 'Internal server error' });
  }
});

// Handle POST requests for client-to-server communication
app.post('/:serverId', async (req: any, res) => {
  // Check for existing session ID
  try {
    const { data, mcpToolData, mcpToolDataSchema }: any = await getServer(
      req.params.serverId
    );
    console.log('back from server');
    if (data.error) {
      res.status(401).json({ error: true, message: 'Unauthorized' });
      return;
    }

    // Set server data for use in MCP handlers
    setListToolsData(data, mcpToolDataSchema);
    setCallToolData(data, mcpToolData, mcpToolDataSchema, req.user);
  } catch (error) {
    console.error('Error getting server data:', error);
    res.status(500).json({ error: true, message: 'Internal server error' });
    return;
  }

  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    console.log('reuse existing transport');
    transport = transports[sessionId];
  } else if (!sessionId && req.body.method === 'initialize') {
    // New initialization request - check if we already have a pending one
    const clientId = req.ip || 'unknown';

    if (pendingInitializations.has(clientId)) {
      console.log('Initialization already in progress for client:', clientId);
      // Return a temporary response while initialization is in progress
      res.status(202).json({
        jsonrpc: '2.0',
        result: {
          protocolVersion: '2025-06-18',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: 'sloot-mcp-server',
            version: '1.0.0',
          },
        },
        id: req.body.id,
      });
      return;
    }

    // Mark this client as initializing
    pendingInitializations.add(clientId);

    const newSessionId = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sessionId: string) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
        console.log(`New MCP session initialized: ${sessionId}`);
        // Remove from pending initializations
        pendingInitializations.delete(clientId);
      },
      // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
      // locally, make sure to set:
      // enableDnsRebindingProtection: true,
      // allowedHosts: ['127.0.0.1'],
    });

    // Clean up transport when closed
    transport.onclose = () => {
      if (transport.sessionId) {
        console.log(`MCP session closed: ${transport.sessionId}`);
        delete transports[transport.sessionId];
      }
      // Remove from pending initializations
      pendingInitializations.delete(clientId);
    };

    // Connect the server to the transport
    await server.connect(transport);
  } else {
    // Invalid request
    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Bad Request: No valid session ID provided',
      },
      id: null,
    });
    return;
  }

  // Handle the request using the transport's request handler
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    res.status(500).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
      },
      id: req.body.id || null,
    });
  }
});

// Reusable handler for GET and DELETE requests
const handleSessionRequest = async (
  req: express.Request,
  res: express.Response
) => {
  console.log('at the server handle session request');
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    console.log('invalid or missing session ID');
    res.status(400).send('Invalid or missing session ID');
    return;
  }

  const transport = transports[sessionId];
  console.log('transport', transport);
  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling session request:', error);
    res.status(500).send('Internal server error');
  }
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/', handleSessionRequest);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    activeSessions: Object.keys(transports).length,
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/:serverId`);
  console.log(`🔐 OAuth MCP endpoint: http://localhost:${PORT}/mcp/:serverId`);
  console.log(
    `🔍 OAuth metadata: http://localhost:${PORT}/.well-known/oauth-authorization-server`
  );
  console.log(`📝 Client registration: http://localhost:${PORT}/register`);
  console.log(`🔑 OAuth authorize: http://localhost:${PORT}/authorize`);
  console.log(`🔄 OAuth token: http://localhost:${PORT}/token`);
  console.log(`📞 OAuth callback: http://localhost:${PORT}/oauth/callback`);
  console.log(`❤️  Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down MCP server...');
  process.exit(0);
});
