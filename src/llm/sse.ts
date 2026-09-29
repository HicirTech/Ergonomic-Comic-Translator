/**
 * Splits a Server-Sent Events byte stream into `data:` payloads. Handles events split across chunks,
 * CRLF line ends and comment lines; yields "[DONE]" like any other payload.
 */
export async function* readSseData(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let data: string[] = [];
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).replace(/\r$/u, "");
      buffer = buffer.slice(newline + 1);
      if (line === "") {
        if (data.length > 0) yield data.join("\n");
        data = [];
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).replace(/^ /u, ""));
      }
      newline = buffer.indexOf("\n");
    }
  }
  if (data.length > 0) yield data.join("\n");
}
