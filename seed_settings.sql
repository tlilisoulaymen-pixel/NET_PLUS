DELETE FROM `tabSingles` WHERE doctype='NetPlus Settings' AND field='google_maps_api_key';
INSERT INTO `tabSingles` (doctype, field, value) VALUES ('NetPlus Settings', 'google_maps_api_key', 'AIzaSyDBVwEYtvHGnuKdmaKEfEo-OgaIC6RflnQ');
SELECT field, value FROM `tabSingles` WHERE doctype='NetPlus Settings' AND field='google_maps_api_key';
