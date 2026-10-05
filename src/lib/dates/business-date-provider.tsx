"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getBusinessDateValue, getBusinessMonthValue } from "./business-date";

const BusinessDateContext = createContext<{
  businessDate: string | null;
  timeZone: string;
  getCurrentTime: () => Date;
  hasServerClock: boolean;
}>({ businessDate: null, timeZone: "Asia/Phnom_Penh", getCurrentTime: () => new Date(), hasServerClock: false });

export function BusinessDateProvider({
  businessDate,
  children,
  serverTime,
  timeZone,
}: {
  businessDate: string;
  children: ReactNode;
  serverTime?: string;
  timeZone: string;
}) {
  const [currentDate, setCurrentDate] = useState(businessDate);
  const [getCurrentTime] = useState(() => {
    if (!serverTime) return () => new Date();
    const referenceTime = Date.parse(serverTime);
    const startedAt = performance.now();
    return () => new Date(referenceTime + performance.now() - startedAt);
  });

  useEffect(() => {
    const refreshDate = () =>
      setCurrentDate(getBusinessDateValue(getCurrentTime(), timeZone));
    refreshDate();
    const timer = window.setInterval(refreshDate, 60_000);
    return () => window.clearInterval(timer);
  }, [businessDate, getCurrentTime, timeZone]);

  return (
    <BusinessDateContext.Provider value={{ businessDate: currentDate, getCurrentTime, hasServerClock: Boolean(serverTime), timeZone }}>
      {children}
    </BusinessDateContext.Provider>
  );
}

export function useBusinessDate() {
  const { businessDate, getCurrentTime, hasServerClock, timeZone } = useContext(BusinessDateContext);
  return {
    getBusinessDateValue: (date?: Date) =>
      date
        ? getBusinessDateValue(date, timeZone)
        : hasServerClock || !businessDate
          ? getBusinessDateValue(getCurrentTime(), timeZone)
          : businessDate,
    getBusinessMonthValue: (date?: Date) =>
      date
        ? getBusinessMonthValue(date, timeZone)
        : hasServerClock || !businessDate
          ? getBusinessMonthValue(getCurrentTime(), timeZone)
          : businessDate.slice(0, 7),
    getToday: () => getBusinessDateValue(getCurrentTime(), timeZone),
    timeZone,
  };
}
