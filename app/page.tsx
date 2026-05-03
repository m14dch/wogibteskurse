import { Suspense } from "react";
import MapPage from "@/components/MapPage";

export default function Home() {
  return (
    <Suspense>
      <MapPage />
    </Suspense>
  );
}
