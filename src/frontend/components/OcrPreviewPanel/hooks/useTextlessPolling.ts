import { useEffect, useRef, useState } from "react";
import { getTextlessPageUrl } from "../../../api/index.ts";

export const useTextlessPolling = (
  uploadId: string,
  pageIndex: number,
  setImageMode: (mode: "text" | "textless") => void,
) => {
  const [isTextlessAvailable, setIsTextlessAvailable] = useState(false);
  const [textlessVersion, setTextlessVersion] = useState(0);
  const lastContentLengthRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    lastContentLengthRef.current = null;
    const checkTextless = async () => {
      try {
        const url = getTextlessPageUrl(uploadId, pageIndex);
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (cancelled) return;
        let available = res.ok;
        if (!available && res.status === 404) {
          const getProbe = await fetch(url, { method: "GET", cache: "no-store" });
          if (cancelled) return;
          available = getProbe.ok;
        }
        setIsTextlessAvailable(available);
        if (available) {
          // Bump version only when the image actually changed to avoid a full
          // re-render every 2 seconds. The server returns Last-Modified and
          // Content-Length headers; either one suffices as a change fingerprint.
          const sig = res.headers.get("last-modified")
            ?? res.headers.get("content-length")
            ?? res.headers.get("etag");
          if (sig === null || sig !== lastContentLengthRef.current) {
            lastContentLengthRef.current = sig;
            setTextlessVersion(Date.now());
          }
        }
        if (!available) setImageMode("text");
      } catch {
        if (cancelled) return;
        setIsTextlessAvailable(false);
        setImageMode("text");
      }
    };
    void checkTextless();
    const timer = window.setInterval(() => { void checkTextless(); }, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [uploadId, pageIndex, setImageMode]);

  return { isTextlessAvailable, textlessVersion };
};
