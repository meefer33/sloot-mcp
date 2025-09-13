import { getClient } from './supabaseClient.js';
import { getPipedreamClient } from './pipedreamClient.js';

// Type definitions
export interface ToolResponse {
  success?: boolean;
  error?: string;
  message?: string;
  result?: any;
  usage?: any;
}

export interface ToolData {
  id: string;
  schema: any;
  user_id: string;
  is_pipedream: boolean;
  pipedream?: any;
  is_sloot: boolean;
  sloot?: {
    type: string;
    brand: string;
    pricing: {
      amount: number;
    };
  };
  user_connect_api?: {
    api_url: string;
    auth_token: string;
  };
}

export interface FinalResponse {
  result: any;
  usage: any[] | null;
}

export interface SlootToolResponse {
  result: any;
  usage: any[];
}

export interface FileMetadata {
  user_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  public_url: string;
}
export const callTool = async (
  toolData: ToolData | { error: string },
  completedArgs: any,
  userId: string
): Promise<FinalResponse> => {
  const finalResponse: FinalResponse = { result: null, usage: null };
  try {
    if ('error' in toolData) {
      finalResponse.result = { error: toolData.error };
      return finalResponse;
    }

    if (toolData?.is_pipedream) {
      const action = await runPipedreamAction(
        toolData.user_id,
        toolData,
        completedArgs
      );
      finalResponse.result = action;
      return finalResponse;
    } else {
      console.log('completedArgs', completedArgs);
      delete completedArgs.tool_id;

      const apiCall = await fetch(toolData.user_connect_api!.api_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${toolData.user_connect_api!.auth_token}`,
        },
        body: JSON.stringify(completedArgs),
      });

      const response = await apiCall.json();
      //process sloot tool
      if (toolData?.is_sloot) {
        const result = await callSlootTool(toolData, response, userId);
        if (result !== null) {
          finalResponse.result = result.result;
          finalResponse.usage = result.usage;
        }
      } else {
        finalResponse.result = response;
        finalResponse.usage = null;
      }
      return finalResponse;
    }
  } catch (error: any) {
    console.error('Error executing tool:', error.message);
    finalResponse.result = { error: error.message };
    return finalResponse;
  }
};

export const runPipedreamAction = async (
  userId: string,
  tool: ToolData,
  payload: any
): Promise<any> => {
  const pd = getPipedreamClient();
  const action = await pd.actions.run({
    externalUserId: userId,
    id: tool.schema.name,
    configuredProps: {
      [tool.pipedream.appType.name]: {
        authProvisionId: tool.pipedream.id,
      },
      ...payload,
    },
  });
  return action;
};

const callSlootTool = async (
  toolData: ToolData,
  response: any,
  userId: string
): Promise<SlootToolResponse | null> => {
  const finalResponse: SlootToolResponse = { result: null, usage: [] };
  switch (toolData?.sloot?.type) {
    case 'images/generations': {
      const iterator = response?.images ? response?.images : response?.data;
      if (iterator) {
        await Promise.all(
          iterator.map(async (image: any, index: number) => {
            const result = await saveFileFromUrl(image?.url, userId, toolData);
            iterator[index].url = result;
            finalResponse.usage.push({
              type: 'tool',
              toolName: toolData.schema.name || 'Unknown',
              brand: toolData.sloot!.brand || 'Unknown',
              toolId: toolData.id || 'Unknown',
              output: {
                type: 'image_url',
                content: result,
              },
              total_cost: toolData.sloot!.pricing.amount || 0,
            });
          })
        );
      }
      finalResponse.result = response;
      return finalResponse;
    }
    default:
      finalResponse.result = response;
      return finalResponse;
  }
};

const saveFileFromUrl = async (
  url: string,
  userId: string,
  toolData: ToolData
): Promise<string | null> => {
  const { supabase } = await getClient();
  try {
    // Fetch the file from the URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch file: ${response.status} ${response.statusText}`
      );
    }

    // Get the file blob
    const blob = await response.blob();

    // Determine file name from URL or use provided name
    const urlFileName =
      url.split('/').pop()?.split('?')[0] || 'downloaded-file';
    const fileExt = urlFileName.split('.').pop() || 'bin';

    // Format date as MM/DD/YYYY:HH:MM:SS
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const finalFileName = `${toolData.schema.name}-${month}${day}${year}${hours}${minutes}${seconds}.${fileExt}`;
    const filePath = `${userId}/${finalFileName}`;

    // Create a Buffer from the blob for Node.js compatibility
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload the actual file to Supabase storage
    const { error } = await supabase.storage
      .from('user-files')
      .upload(filePath, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: blob.type || 'application/octet-stream',
      });

    if (error) {
      console.error('Error uploading file to Supabase storage:', error);
      return null;
    }

    // Get the public URL
    const { data: urlData } = await supabase.storage
      .from('user-files')
      .getPublicUrl(filePath);

    // Save file metadata to database
    const fileMetadata: FileMetadata = {
      user_id: userId,
      file_name: finalFileName,
      file_path: filePath,
      file_size: blob.size,
      file_type: blob.type || 'application/octet-stream',
      public_url: urlData.publicUrl,
    };

    const { error: dbError } = await supabase
      .from('user_files')
      .insert(fileMetadata);

    if (dbError) {
      return null;
    }

    return urlData.publicUrl;
  } catch (error: any) {
    console.error('Error downloading file from URL:', error);
    return null;
  }
};
