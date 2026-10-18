const SIDEBAR_COOKIE_NAME = "sidebar_state";

export const readSidebarOpen = () => {
  const cookie = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${SIDEBAR_COOKIE_NAME}=`));

  return cookie?.split("=")[1] !== "false";
};
