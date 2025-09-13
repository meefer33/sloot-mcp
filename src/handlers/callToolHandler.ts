import { api } from '../utils/api.js';
// Global variables to store server data for current request
let currentServerData: any = null;
let currentMcpToolData: any = null;
let currentMcpToolDataSchema: any = null;
let currentUser: any = null;

// Function to set the current server data
export function setCurrentServerData(
  data: any,
  mcpToolData: any,
  mcpToolDataSchema: any,
  user: any
) {
  currentServerData = data;
  currentMcpToolData = mcpToolData;
  currentMcpToolDataSchema = mcpToolDataSchema;
  currentUser = user;
}

// CallToolRequestSchema handler
export function createCallToolHandler() {
  return async (request: any) => {
    const { name, arguments: args } = request.params;
    console.log('at the server call tool request');

    const toolData = currentMcpToolData.find(
      (item: any) => item.schema.name === name
    );
console.log('starint tool call');
    // Handle any tool call
    try {
      const res = await api(args, toolData, currentUser);
console.log('ending tool call');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(res),
          },
        ],
      };
    } catch (error: any) {
      console.error('Error in tool call:', error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(error),
          },
        ],
      };
    }
  };
}
