import * as React from "react";

export type DeviceType = 'phone' | 'tablet' | 'desktop';

// Breakpoints for device detection
const TABLET_MIN = 768;  // iPad Mini portrait and up
const DESKTOP_MIN = 1024; // Larger tablets landscape / desktop

export function useDeviceSize(): { 
  deviceType: DeviceType; 
  isPhone: boolean; 
  isTablet: boolean; 
  isDesktop: boolean;
  screenWidth: number;
} {
  const [screenWidth, setScreenWidth] = React.useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 375
  );

  React.useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    // Set initial value
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const deviceType: DeviceType = React.useMemo(() => {
    if (screenWidth >= DESKTOP_MIN) return 'desktop';
    if (screenWidth >= TABLET_MIN) return 'tablet';
    return 'phone';
  }, [screenWidth]);

  return {
    deviceType,
    isPhone: deviceType === 'phone',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    screenWidth,
  };
}

// Size multipliers for different device types
// Use these to scale UI elements proportionally
export const SIZE_MULTIPLIERS: Record<DeviceType, {
  card: number;      // Playing card scale
  spacing: number;   // Gap/margin scale
  text: number;      // Font size scale
  avatar: number;    // Player avatar scale
}> = {
  phone: {
    card: 1,
    spacing: 1,
    text: 1,
    avatar: 1,
  },
  tablet: {
    card: 1.35,
    spacing: 1.25,
    text: 1.15,
    avatar: 1.3,
  },
  desktop: {
    card: 1.5,
    spacing: 1.5,
    text: 1.25,
    avatar: 1.5,
  },
};

// Helper to get card size based on device
export function getCardSizeForDevice(deviceType: DeviceType, baseSize: 'sm' | 'md' | 'lg' | 'xl' = 'md'): 'sm' | 'md' | 'lg' | 'xl' {
  const sizeMap: Record<DeviceType, Record<string, 'sm' | 'md' | 'lg' | 'xl'>> = {
    phone: { sm: 'sm', md: 'md', lg: 'lg', xl: 'xl' },
    tablet: { sm: 'md', md: 'lg', lg: 'xl', xl: 'xl' },
    desktop: { sm: 'lg', md: 'xl', lg: 'xl', xl: 'xl' },
  };
  return sizeMap[deviceType][baseSize];
}

// Tailwind class helpers for responsive sizing
export function getDeviceClasses(deviceType: DeviceType): {
  cardGap: string;
  playerGap: string;
  containerPadding: string;
} {
  const classes: Record<DeviceType, { cardGap: string; playerGap: string; containerPadding: string }> = {
    phone: {
      cardGap: 'gap-0.5',
      playerGap: 'gap-2',
      containerPadding: 'p-2',
    },
    tablet: {
      cardGap: 'gap-1',
      playerGap: 'gap-3',
      containerPadding: 'p-3',
    },
    desktop: {
      cardGap: 'gap-1.5',
      playerGap: 'gap-4',
      containerPadding: 'p-4',
    },
  };
  return classes[deviceType];
}
