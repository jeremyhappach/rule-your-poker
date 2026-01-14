import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // TEMPORARY: Force mobile layout for all devices
  // TODO: Remove this override once desktop layout issues are fixed
  return true;

  /* Original implementation - restore when ready:
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
  */
}
