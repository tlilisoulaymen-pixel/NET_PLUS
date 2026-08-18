To display an interactive map with live user tracking inside your app's UI, you **must use a Google Maps SDK** (for mobile apps) or the **Google Maps JavaScript API** (for web applications).

Standard HTTP/REST APIs are designed for backend data processing (such as turning an address into coordinates or calculating routes) rather than rendering interactive visual map UI components on screen.

**Implementation by Platform**

* **Native Android**: Add the `com.google.android.gms:play-services-maps` SDK dependency to your `build.gradle` file.
* **Native iOS**: Download and import the `GoogleMaps` library via Swift Package Manager or CocoaPods.
* **Flutter / React Native**: Install framework wrapper packages like `google_maps_flutter` or `react-native-maps`, which bind directly to the native Android and iOS SDKs.
* **Web App**: Load the Google Maps JavaScript API script tag or install `@googlemaps/js-api-loader`.

**Role of the SDK vs. REST APIs**

* **Maps SDK / JavaScript API**: Renders the dynamic map, handles user touch gestures (pan, pinch, zoom), draws custom markers, and provides the native "My Location" blue dot layer.
* **REST APIs (Optional)**: Used in tandem with the SDK if you need non-visual services like address auto-complete (Places API), address-to-coordinate conversion (Geocoding API), or routing (Directions API).

**Quick Start Workflow**

1. Create a project in the **Google Cloud Console** and enable the platform-specific Maps SDK.
2. Generate an **API Key** and apply restrictions (e.g., restrict by iOS Bundle ID or Android package name and SHA-1 fingerprint).
3. Request location permissions on the device (using CoreLocation on iOS or LocationManager/FusedLocationProvider on Android) to pass the user's live coordinates directly into the map view layer.