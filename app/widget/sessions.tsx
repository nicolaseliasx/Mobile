import { Redirect } from "expo-router";

// Route for termix-mobile://widget/sessions when Expo Router handles the URL.
export default function WidgetSessions() {
  return <Redirect href="/(tabs)/sessions?overview=1" />;
}
