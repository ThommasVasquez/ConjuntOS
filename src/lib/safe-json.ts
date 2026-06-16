const replacer = (key: string, value: unknown) => {
  if (typeof value === "bigint") return value.toString();
  return value;
};

export const safeJsonStringify = (obj: unknown) => {
  try {
    return JSON.stringify(obj, replacer);
  } catch {
    return '{"error": "Serialization failed"}';
  }
};
