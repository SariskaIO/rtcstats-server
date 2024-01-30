const WebServiceClient = require('@maxmind/geoip2-node').WebServiceClient;
// Typescript:
// import { WebServiceClient } from '@maxmind/geoip2-node';

// To use the GeoLite2 web service instead of the GeoIP2 web service, set
// the host to geolite.info, e.g.:
// new WebServiceClient('1234', 'licenseKey', {host: 'geolite.info'});
//
// To use the Sandbox GeoIP2 web service instead of the production GeoIP2
// web service, set the host to sandbox.maxmind.com, e.g.:
// new WebServiceClient('1234', '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', {host: 'sandbox.maxmind.com'});
const client = new WebServiceClient('1234', '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');

client.country('142.1.1.1').then(response => {
  console.log(response.country.isoCode); // 'CA'
});
