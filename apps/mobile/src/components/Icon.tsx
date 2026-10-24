import type { ColorValue } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type IconName =
  | 'sun'
  | 'map'
  | 'spark'
  | 'chart'
  | 'pin'
  | 'chevronDown'
  | 'chevronRight'
  | 'bell'
  | 'warning'
  | 'leaf'
  | 'drop'
  | 'mic'
  | 'camera'
  | 'compass'
  | 'village'
  | 'people'
  | 'back'
  | 'target'
  | 'calendar'
  | 'chip'
  | 'plan'
  | 'settings'
  | 'book';

/** Prototipteki çizgi ikonları (24x24, çizgi kalınlığı 2). Anlam her zaman yazıyla da verilir. */
export function Icon({
  name,
  size = 24,
  color = '#064D3B',
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape(name)}
    </Svg>
  );
}

function shape(name: IconName) {
  switch (name) {
    case 'sun':
      return (
        <>
          <Circle cx={12} cy={12} r={4} />
          <Path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
        </>
      );
    case 'map':
      return (
        <>
          <Path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
          <Path d="M9 4v14M15 6v14" />
        </>
      );
    case 'spark':
      return <Path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />;
    case 'chart':
      return (
        <>
          <Path d="M4 19V5M4 19h16" />
          <Path d="M8 15l4-4 3 3 5-6" />
        </>
      );
    case 'pin':
      return (
        <>
          <Path d="M12 21s7-6.2 7-11.5a7 7 0 0 0-14 0C5 14.8 12 21 12 21z" />
          <Circle cx={12} cy={9.5} r={2.5} />
        </>
      );
    case 'chevronDown':
      return <Path d="M6 9l6 6 6-6" />;
    case 'chevronRight':
      return <Path d="M9 6l6 6-6 6" />;
    case 'bell':
      return (
        <>
          <Path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
          <Path d="M10 20a2 2 0 0 0 4 0" />
        </>
      );
    case 'warning':
      return (
        <>
          <Path d="M12 3l10 18H2z" />
          <Path d="M12 10v5M12 18v.01" />
        </>
      );
    case 'leaf':
      return (
        <>
          <Path d="M12 21v-8" />
          <Path d="M12 13c0-4 3-7 8-7 0 5-3 7-8 7z" />
          <Path d="M12 15c0-3-2-5-6-5 0 4 2 5 6 5z" />
        </>
      );
    case 'drop':
      return <Path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />;
    case 'mic':
      return (
        <>
          <Rect x={9} y={3} width={6} height={11} rx={3} />
          <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </>
      );
    case 'camera':
      return (
        <>
          <Path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <Circle cx={12} cy={13} r={3.5} />
        </>
      );
    case 'village':
      return (
        <>
          <Path d="M3 20h18M5 20V10l7-5 7 5v10" />
          <Path d="M10 20v-6h4v6" />
        </>
      );
    case 'people':
      return (
        <>
          <Circle cx={9} cy={8} r={3.5} />
          <Path d="M2 20c0-4 3-6 7-6s7 2 7 6" />
          <Path d="M17 5h5M19.5 2.5v5" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x={4} y={5} width={16} height={15} rx={2} />
          <Path d="M4 10h16M8 3v4M16 3v4" />
        </>
      );
    case 'chip':
      return (
        <>
          <Rect x={7} y={7} width={10} height={10} rx={1.5} />
          <Path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
        </>
      );
    case 'plan':
      return (
        <>
          <Path d="M5 4h14v16H5z" />
          <Path d="M9 9h6M9 13h6M9 17h3" />
        </>
      );
    case 'settings':
      return (
        <>
          <Path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
          <Circle cx={16} cy={7} r={2} />
          <Circle cx={8} cy={17} r={2} />
        </>
      );
    case 'book':
      return (
        <>
          <Path d="M4 5c3-1 5-1 8 1v14c-3-2-5-2-8-1z" />
          <Path d="M20 5c-3-1-5-1-8 1v14c3-2 5-2 8-1z" />
        </>
      );
    case 'back':
      return <Path d="M15 6l-6 6 6 6" />;
    case 'target':
      return (
        <>
          <Circle cx={12} cy={12} r={3.5} />
          <Circle cx={12} cy={12} r={8} />
          <Path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
        </>
      );
    case 'compass':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Path d="M15.5 8.5l-2 5-5 2 2-5z" />
        </>
      );
  }
}
