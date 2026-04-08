const replacer = (key: string, value: any) => {
  if (typeof value === "bigint") return value.toString();
  return value;
};

export const safeJsonStringify = (obj: any) => {
  try {
    return JSON.stringify(obj, replacer);
  } catch (err) {
    return '{"error": "Serialization failed"}';
  }
};
