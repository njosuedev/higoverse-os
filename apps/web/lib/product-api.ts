import { getToken } from "@/lib/auth";

const PRODUCT_API =
  "https://higoverse-products.vercel.app";

export async function productRequest(
  endpoint: string,
  options: RequestInit = {}
) {
  const token = getToken();

  const response = await fetch(
    `${PRODUCT_API}${endpoint}`,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token && {
          Authorization: `Bearer ${token}`,
        }),
        ...(options.headers || {}),
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Product Service Error: ${response.status}`
    );
  }

  return response.json();
}