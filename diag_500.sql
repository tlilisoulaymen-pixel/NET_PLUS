SELECT name FROM tabDocType WHERE name IN ('Mission','Service Contract','NetPlus Settings','Mission Alert','Operator Score') ORDER BY name;

SELECT field, value FROM tabSingles WHERE doctype = 'NetPlus Settings' AND field = 'google_maps_api_key';

SELECT name, user_type FROM tabUser WHERE name IN ('operator1@netplus.ca','supervisor1@netplus.ca','jdupont@gestionimmo.ca');

SELECT parent, role FROM tabHasRole WHERE parent IN ('operator1@netplus.ca','supervisor1@netplus.ca','jdupont@gestionimmo.ca') AND role LIKE 'NetPlus%' ORDER BY parent, role;
