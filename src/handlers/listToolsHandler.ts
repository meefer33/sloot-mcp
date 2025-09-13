// Global variables to store server data for current request
let currentServerData: any = null;
let currentMcpToolDataSchema: any = null;

// Function to set the current server data
export function setCurrentServerData(data: any, mcpToolDataSchema: any) {
  currentServerData = data;
  currentMcpToolDataSchema =  mcpToolDataSchema;
}

// ListToolsRequestSchema handler
export function createListToolsHandler() {
  return async () => {
    console.log('at the server list tools request');
    console.log('currentServerData:', currentServerData);
    console.log('currentMcpToolDataSchema:', currentMcpToolDataSchema);

    // Use the dynamic tools from mcpToolData if available, otherwise use default tools
    const tools = currentMcpToolDataSchema || [
      {
        name: 'echo',
        description: 'Echo back the input message',
        inputSchema: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The message to echo back',
            },
          },
          required: ['message'],
        },
      },
      {
        name: 'get_time',
        description: 'Get the current server time',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'calculate',
        description: 'Perform basic mathematical calculations',
        inputSchema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description:
                "Mathematical expression to evaluate (e.g., '2 + 2', '10 * 5')",
            },
          },
          required: ['expression'],
        },
      },
    ];

    return { tools };
  };
}
