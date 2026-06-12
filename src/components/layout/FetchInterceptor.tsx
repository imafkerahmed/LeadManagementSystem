"use client";

import { useEffect, useRef } from "react";

interface InterceptedFetch {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  __isIntercepted?: boolean;
}

export default function FetchInterceptor() {
  const isHooked = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || isHooked.current) return;
    
    const currentFetch = window.fetch as InterceptedFetch;
    if (currentFetch.__isIntercepted) {
      isHooked.current = true;
      return;
    }

    const originalFetch = window.fetch;

    const interceptedFetch: InterceptedFetch = async function (input, init) {
      let url = "";
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.toString();
      } else if (input instanceof Request) {
        url = input.url;
      }

      // Check if it targets an internal Next.js API route
      const isInternalApi = url.startsWith("/api/") || url.includes("/api/");

      if (isInternalApi) {
        let token = "";
        try {
          const authDataStr = localStorage.getItem("pocketbase_auth");
          if (authDataStr) {
            const authData = JSON.parse(authDataStr);
            token = authData.token || "";
          }
        } catch {
          // ignore
        }

        if (token) {
          const newInit = init ? { ...init } : {};
          const headers = new Headers(newInit.headers);
          
          if (!headers.has("Authorization")) {
            headers.set("Authorization", `Bearer ${token}`);
          }
          
          newInit.headers = headers;

          if (input instanceof Request) {
            const newRequest = new Request(input, {
              headers: headers,
            });
            return originalFetch(newRequest, newInit);
          }

          return originalFetch(input, newInit);
        }
      }

      return originalFetch(input, init);
    };

    interceptedFetch.__isIntercepted = true;
    window.fetch = interceptedFetch;
    isHooked.current = true;

    return () => {
      // Restore original fetch on unmount if needed
      window.fetch = originalFetch;
      isHooked.current = false;
    };
  }, []);

  return null;
}
