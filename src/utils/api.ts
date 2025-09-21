import axios from 'axios';

export async function api(data: any, toolData: any, user: any) {
  try {
    console.log('data api', JSON.stringify(data));
    console.log('toolData api', toolData);
    console.log('user api', user);

    /*
    old call to /tools/execute if headers got to large for the api call
      const response = await axios({
        method: 'POST',
        url: 'http://slootapi:3001/tools/execute', // Internal container communication
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        data: { toolId: toolData.id, payload: data },
        // timeout: 30000, // 30 second timeout
        // maxRedirects: 5,
        // validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });
    */

    const tool = {
      id: toolData.id,
      schema: toolData.schema,
      user_id: user.id,
      is_pipedream: toolData.is_pipedream,
      pipedream: toolData.pipedream,
      is_sloot: toolData.is_sloot,
      sloot: toolData.sloot,
      user_connect_api: toolData.user_connect_api,
    };


    // Initial API call to start image generation
    try {
      // Use internal container communication since both containers are on same network
      console.log('calling tool');
      const response = await axios({
        method: 'POST',
        url: 'http://slootapi:3001/tools/run', // Internal container communication
        headers: {
          Authorization: `Bearer ${user.token}`,
          'Content-Type': 'application/json',
        },
        data: { tool: tool, payload: data },
        // timeout: 30000, // 30 second timeout
        // maxRedirects: 5,
        // validateStatus: (status) => status < 500, // Don't throw on 4xx errors
      });
      console.log('back from tool', response);
      return response.data;
    } catch (error: any) {
      console.error(`Error in image generation: ${error.message}`);
      return {
        error: true,
        message: `Error in image generation: ${error.message}`,
      };
    }
  } catch (error: any) {
    console.error(`Unexpected error: ${error.message}`);
    return {
      error: true,
      message: `An unexpected error occurred: ${error.message}`,
    };
  }
}
