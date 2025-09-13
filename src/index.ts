import express from 'express';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

const app = express();
app.use(express.json());
import cors from 'cors';

// Add CORS middleware before your MCP routes
app.use(cors({
  origin: '*', // Configure appropriately for production, for example:
  // origin: ['https://your-remote-domain.com', 'https://your-other-remote-domain.com'],
  exposedHeaders: ['Mcp-Session-Id'],
  allowedHeaders: ['Content-Type', 'mcp-session-id'],
}));

// Map to store transports by session ID

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// Create MCP server instance
const server = new Server({
  name: "sloot-mcp-server",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {},
    resources: {},
    prompts: {}
  }
});

// Set up server tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.log('at the server list tools request')
  return {
    tools: [
      {
        name: "echo",
        description: "Echo back the input message",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "The message to echo back"
            }
          },
          required: ["message"]
        }
      },
      {
        name: "get_time",
        description: "Get the current server time",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "calculate",
        description: "Perform basic mathematical calculations",
        inputSchema: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5')"
            }
          },
          required: ["expression"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;
  console.log('at the server call tool request')
  switch (name) {
    case "echo":
      return {
        content: [
          {
            type: "text",
            text: `Echo: ${args.message}`
          }
        ]
      };

    case "get_time":
      return {
        content: [
          {
            type: "text",
            text: `Current server time: ${new Date().toISOString()}`
          }
        ]
      };

    case "calculate":
      try {
        // Simple evaluation - in production, use a proper math parser
        const result = eval(args.expression);
        return {
          content: [
            {
              type: "text",
              text: `${args.expression} = ${result}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error evaluating expression: ${error instanceof Error ? error.message : 'Unknown error'}`
            }
          ],
          isError: true
        };
      }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  // Check for existing session ID
  console.log('at the server post request')
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  let transport: StreamableHTTPServerTransport;

  if (sessionId && transports[sessionId]) {
    // Reuse existing transport
    transport = transports[sessionId];
  } else if (!sessionId && req.body.method === 'initialize') {
    // New initialization request
    const newSessionId = randomUUID();
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
      onsessioninitialized: (sessionId: string) => {
        // Store the transport by session ID
        transports[sessionId] = transport;
        console.log(`New MCP session initialized: ${sessionId}`);
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
    };

    // Connect the server to the transport only once for new sessions
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
const handleSessionRequest = async (req: express.Request, res: express.Response) => {
  console.log('at the server handle session request')
  const sessionId = req.headers['mcp-session-id'] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  
  const transport = transports[sessionId];
  try {
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error('Error handling session request:', error);
    res.status(500).send('Internal server error');
  }
};

// Handle GET requests for server-to-client notifications via SSE
app.get('/mcp', handleSessionRequest);

// Handle DELETE requests for session termination
app.delete('/mcp', handleSessionRequest);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    activeSessions: Object.keys(transports).length
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 MCP Server running on port ${PORT}`);
  console.log(`📡 MCP endpoint: http://localhost:${PORT}/mcp`);
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