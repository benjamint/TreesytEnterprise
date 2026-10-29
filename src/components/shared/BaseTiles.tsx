import { TileLayer } from 'react-leaflet';
import { useSessionStore } from '@/stores/sessionStore';

const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Muted base map that follows the app theme (CARTO Positron in light, Dark Matter in dark), so data points stand out. */
export function BaseTiles() {
  const theme = useSessionStore((s) => s.theme);
  const style = theme === 'dark' ? 'dark_all' : 'light_all';
  return <TileLayer key={style} url={`https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`} subdomains="abcd" maxZoom={20} attribution={ATTRIBUTION} />;
}
