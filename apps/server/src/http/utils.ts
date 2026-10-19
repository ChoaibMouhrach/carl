export class AppRedirect extends Error {
  public to: string | URL;

  public constructor(input: { to: string | URL }) {
    super();

    this.to = input.to;
  }
}

/**
 * A browser's fetch would follow the redirect itself, hand the agent's callback a request
 * without the user's browser, and leave the page with an error. JSON clients get the target
 * instead and navigate there themselves.
 */
export const redirectAsJson = (request: Request, response: Response) => {
  const location = response.headers.get("location");
  const wantsJson = request.headers
    .get("content-type")
    ?.includes("application/json");

  if (response.status !== 302 || !location || !wantsJson) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("location");
  headers.delete("content-length");
  headers.set("content-type", "application/json");

  return new Response(JSON.stringify({ redirect: true, url: location }), {
    status: 200,
    headers,
  });
};
