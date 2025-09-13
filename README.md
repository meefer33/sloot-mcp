# Sloot MCP Server

A complete TypeScript Model Context Protocol (MCP) server implementation using Express.js and the official MCP SDK.

## Features

- 🚀 **Express.js HTTP Server**: RESTful API with MCP protocol support
- 🔧 **Session Management**: Automatic session handling with UUID-based session IDs
- 🛠️ **Built-in Tools**: Example tools including echo, time, and calculator
- 📡 **Streamable Transport**: HTTP-based transport with Server-Sent Events (SSE)
- 🔒 **Type Safety**: Full TypeScript implementation with strict typing
- ❤️ **Health Monitoring**: Built-in health check endpoint

## Available Tools

The server provides the following MCP tools:

1. **echo** - Echo back any message
2. **get_time** - Get current server time
3. **calculate** - Perform basic mathematical calculations

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Code Quality Tools

This project includes:
- **ESLint** - Code linting with TypeScript support
- **Prettier** - Code formatting
- **TypeScript** - Type checking and compilation

### Installation

1. Clone or download this project
2. Install dependencies:

```bash
npm install
```

### Development

Run the server in development mode with hot reload:

```bash
npm run dev
```

### Production

Build and run the production server:

```bash
npm run build
npm start
```

### Watch Mode

Run with file watching for development:

```bash
npm run watch
```

### Code Quality

Check code quality and formatting:

```bash
# Lint the code
npm run lint

# Fix linting issues automatically
npm run lint:fix

# Format code with Prettier
npm run format

# Check if code is properly formatted
npm run format:check

# Run all checks (lint + format check + build)
npm run check
```

## Usage

### Starting the Server

The server will start on port 3000 by default (configurable via `PORT` environment variable):

```
🚀 MCP Server running on port 3000
📡 MCP endpoint: http://localhost:3000/mcp
❤️  Health check: http://localhost:3000/health
```

### MCP Endpoints

- **POST /mcp** - Main MCP communication endpoint
- **GET /mcp** - Server-to-client notifications (SSE)
- **DELETE /mcp** - Session termination
- **GET /health** - Health check and status

### Testing the Server

You can test the health endpoint:

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "activeSessions": 0
}
```

## MCP Client Integration

This server is designed to work with MCP clients. The server handles:

- Session initialization with automatic UUID generation
- Session persistence across requests
- Proper cleanup when sessions are closed
- DNS rebinding protection (configurable)

### Session Headers

When making requests to the MCP endpoint, include the session ID in headers:

```
mcp-session-id: <session-uuid>
```

## Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)

### DNS Rebinding Protection

For local development, you can enable DNS rebinding protection by uncommenting and configuring these options in the transport configuration:

```typescript
enableDnsRebindingProtection: true,
allowedHosts: ['127.0.0.1'],
```

## Development

### Project Structure

```
sloot-mcp/
├── src/
│   └── index.ts          # Main server implementation
├── dist/                 # Compiled JavaScript (generated)
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

### Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Run the compiled server
- `npm run dev` - Run with tsx for development
- `npm run watch` - Run with file watching
- `npm run lint` - Run ESLint to check for code issues
- `npm run lint:fix` - Run ESLint and automatically fix issues
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check if code is properly formatted
- `npm run check` - Run linting, formatting check, and build

## Extending the Server

### Adding New Tools

To add new tools, modify the `ListToolsRequestSchema` handler in `src/index.ts`:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools
      {
        name: "your_tool",
        description: "Description of your tool",
        inputSchema: {
          type: "object",
          properties: {
            // Define your tool's parameters
          },
          required: ["required_param"]
        }
      }
    ]
  };
});
```

Then add the tool implementation in the `CallToolRequestSchema` handler.

### Adding Resources

You can add MCP resources by implementing the appropriate request handlers for resources.

## License

MIT
