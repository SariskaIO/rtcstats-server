import json

def lambda_handler(event, context):
    records = event['records']
    
    for record in records:
        payload = json.loads(record['data'])
        date_info = payload.get('date', 'default_date_format')  # Adjust based on your data model
        s3_prefix = f"manifests/{date_info}/"
        
        # Update the S3 key for the record
        record['s3DestinationConfiguration']['prefix'] = s3_prefix
    
    return {'records': records}
