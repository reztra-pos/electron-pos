// Turns a failed request into a message that says WHY it failed (instead of a generic "can't reach").
function netReason(e) {
  const text = `${e?.message || ""} ${e?.cause?.code || ""} ${e?.cause?.message || ""}`;
  if (e?.name === "TimeoutError" || /ERR_TIMED_OUT|ETIMEDOUT/.test(text)) return "The server took too long to answer.";
  if (/CERT|certificate|SSL|self.signed|UNABLE_TO_VERIFY/i.test(text)) return "The server's HTTPS certificate is not trusted on this PC.";
  if (/NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN/.test(text)) return "The server name could not be found (check the address or DNS).";
  if (/CONNECTION_REFUSED|ECONNREFUSED/.test(text)) return "The server refused the connection (is it running?).";
  if (/INTERNET_DISCONNECTED|NETWORK_CHANGED|ENETUNREACH/.test(text)) return "This PC is offline.";
  return `Network error: ${(e?.message || "unknown").trim()}`;
}

module.exports = { netReason };
