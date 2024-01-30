import { RedshiftDataClient, ExecuteStatementCommand } from "@aws-sdk/client-redshift-data";

// Create an instance of the RedshiftDataClient class
const redshiftClient = new RedshiftDataClient({ region: 'ap-south-1' });

// Redshift execution parameters
const executionParams = {
    Database: 'dev',
    WorkgroupName: 'rtc',
    Sql: "", // Leave this empty for now
    SecretArn: "your-secret-arn",
};

export const handler = async (event, context) => {
    // Extract data from the event
    const records = event.records;

    try {
        // Process each record
        for (const record of records) {
            // Extract data from the record
            const payload = JSON.parse(Buffer.from(record.data, 'base64').toString('utf-8'));

            // Extract deliveryStreamArn from the record
            const deliveryStreamArn = event.deliveryStreamArn;

            // Extract table name from deliveryStreamArn
            const tableName = extractTableNameFromArn(deliveryStreamArn);

            // Prepare the SQL query dynamically based on payload fields
            const sql = prepareSqlStatement(tableName, payload);

            // Now you can use the SQL statement as needed for inserting into the corresponding table

            // Rest of your processing logic...

            console.log('SQL Statement:', sql);

            // Execute the SQL statement
            const executeStatementParams = {
                ...executionParams,
                Sql: sql,
            };
            
            const executeStatementCommand = new ExecuteStatementCommand(executeStatementParams);
            
            try {
                const executeStatementResponse = await redshiftClient.send(executeStatementCommand);
                console.log('Execution response:', executeStatementResponse);
            } catch (error) {
                // Handle execution errors
                console.error('Execution error:', error);
                throw error;
}
        }

        return { status: 'success' };
    } catch (error) {
        // Log any exceptions
        console.error(`Error: ${error.message}`);
        throw error;
    }
};

// Function to extract table name from deliveryStreamArn
function extractTableNameFromArn(deliveryStreamArn) {
    // Split deliveryStreamArn by "/"
    
    console.log("deliveryStreamArn", deliveryStreamArn);
    const parts = deliveryStreamArn.split('/');

    // Get the last part (table name)
    const tableName = parts[parts.length - 1];

    // Map the table name to the corresponding table
    switch (tableName) {
        case 'pcStatsStream':
            return 'rtcstats_pc_metrics';
        case 'trackStatsStream':
            return 'rtcstats_track_metrics';
        case 'meetingStatsStream':
            return 'rtcstats';
        case 'meetingEventStream':
            return 'rtcstats_meeting_event';
        case 'faceLandmarksStream':
            return 'rtcstats_face_landmarks';
        case 'e2ePingStream':
            return 'rtcstats_e2e_ping';
        default:
            // Handle unknown table names
            return 'unknownTable';
    }
}

function prepareSqlStatement(tableName, payload) {
    // Extract data fields from payload JSON
    const fields = Object.keys(payload);
    
    // Build the SQL query dynamically
    const sqlValues = fields.map(field => {
        const value = payload[field];
        if (value === null) {
            return 'NULL';
        } else {
            return `'${value}'`;
        }
    });

    const sql = `INSERT INTO public.${tableName} (${fields.join(', ')}) VALUES (${sqlValues.join(', ')});`;

    return sql;
}
