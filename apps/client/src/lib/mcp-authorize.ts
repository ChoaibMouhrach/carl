const requiredParams = ["client_id", "redirect_uri", "response_type"];

export const getPendingMcpAuthorizeQuery = (search: string): string | null => {
  const params = new URLSearchParams(search);
  const isPending = requiredParams.every((key) => params.has(key));

  return isPending ? params.toString() : null;
};
