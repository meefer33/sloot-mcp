import { createClient } from '@supabase/supabase-js';

export const getServer = async (serverId: any) => {
  let mcpToolData: any = null;
  let mcpToolDataSchema: any = null;

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('🔍 Querying server data for serverId:', serverId);
    const { data, error } = await supabase
      .from('user_mcp_servers')
      .select(
        `id,
                  server_name,
                  server_url,
                  type,
                  auth_token,
                user_mcp_server_tools (
                  user_tools(id,schema,user_id,is_pipedream,pipedream,is_sloot,sloot,user_connect_api(*))
                )
              `
      )
      .eq('id', serverId)
      .single();

    if (error) {
      console.error('Database query failed', error);
      return {
        error: true,
        message: 'Database query failed',
        details: error.message,
      };
    }

    if (!data) {
      console.error('Server not found');
      return { error: true, message: 'Server not found' };
    }

    if (
      !data.user_mcp_server_tools ||
      data.user_mcp_server_tools.length === 0
    ) {
      console.error('No tools configured for this server');
      return { error: true, message: 'No tools configured for this server' };
    }

    mcpToolData = data.user_mcp_server_tools.map(
      (item: any) => item.user_tools
    );
    mcpToolDataSchema = data.user_mcp_server_tools.map(
      (item: any) => item.user_tools.schema
    );

    return { data, mcpToolData, mcpToolDataSchema };
  } catch (error: any) {
    console.error('❌ Unexpected error in getServerData:', error);
    return {
      error: true,
      message: 'Unexpected database error',
      details: error.message,
    };
  }
};
