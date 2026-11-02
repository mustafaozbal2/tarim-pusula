import { useEffect, useState } from 'react';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useAzHareket } from '../design/Gecis';

/**
 * Asistanın yüzü: yeşil, yuvarlak hatlı, çiftçi dostu küçük robot (başında yaprak anten, koyu vizörde
 * parlak gözler ve gülümseme, yanaklarda sıcak renk). Çizim tamamen vektör (her boyutta net).
 * Gözler arada bir kırpışır (hareketi azalt açıksa kırpışmaz).
 */
export function Robot({ size = 56, id = 'robot' }: { size?: number; id?: string }) {
  const [blink, setBlink] = useState(false);
  const az = useAzHareket();
  useEffect(() => {
    if (az) return;
    let t2: ReturnType<typeof setTimeout> | undefined;
    const t = setInterval(() => {
      setBlink(true);
      t2 = setTimeout(() => setBlink(false), 140);
    }, 4200);
    return () => {
      clearInterval(t);
      if (t2) clearTimeout(t2);
    };
  }, [az]);
  const eyeRy = blink ? 0.8 : 5.2;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden>
      <Defs>
        <LinearGradient id={`${id}-bas`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#5FD394" />
          <Stop offset="1" stopColor="#1F8F5A" />
        </LinearGradient>
        <LinearGradient id={`${id}-govde`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3DBE7A" />
          <Stop offset="1" stopColor="#17734A" />
        </LinearGradient>
        <LinearGradient id={`${id}-yaprak`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B7F06A" />
          <Stop offset="1" stopColor="#4CAF3E" />
        </LinearGradient>
      </Defs>
      {/* Yaprak anten */}
      <Path
        d="M50 24 C50 18 50 14 51 9"
        stroke="#1F8F5A"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M51 10 C58 2 70 4 72 8 C66 14 56 15 51 10 Z" fill={`url(#${id}-yaprak)`} />
      <Path d="M53 10 C59 8 65 7 70 8" stroke="#2E8B2E" strokeWidth={1} fill="none" opacity={0.6} />
      {/* Kulak cıvataları */}
      <Circle cx={15} cy={48} r={6} fill="#17734A" />
      <Circle cx={85} cy={48} r={6} fill="#17734A" />
      {/* Gövde */}
      <Rect x={32} y={70} width={36} height={22} rx={10} fill={`url(#${id}-govde)`} />
      <Circle cx={50} cy={81} r={4.5} fill="#F2C14E" />
      <Circle cx={50} cy={81} r={2} fill="#FFF4CC" />
      {/* Baş */}
      <Rect x={17} y={22} width={66} height={52} rx={22} fill={`url(#${id}-bas)`} />
      {/* Kabartma ışığı */}
      <Ellipse cx={36} cy={31} rx={13} ry={5} fill="#FFFFFF" opacity={0.35} />
      {/* Vizör */}
      <Rect x={26} y={35} width={48} height={28} rx={14} fill="#0E3B2C" />
      <Ellipse cx={39} cy={47} rx={4.6} ry={eyeRy} fill="#9CFFD0" />
      <Ellipse cx={61} cy={47} rx={4.6} ry={eyeRy} fill="#9CFFD0" />
      <Path
        d="M42 55 Q50 61 58 55"
        stroke="#9CFFD0"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
      {/* Yanaklar */}
      <Circle cx={29} cy={60} r={3.6} fill="#FF9E80" opacity={0.55} />
      <Circle cx={71} cy={60} r={3.6} fill="#FF9E80" opacity={0.55} />
    </Svg>
  );
}
