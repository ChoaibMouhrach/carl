export const withDatabaseName = (connectionString: string, name: string) => {
  const url = new URL(connectionString);
  url.pathname = `/${name}`;

  return url.toString();
};
