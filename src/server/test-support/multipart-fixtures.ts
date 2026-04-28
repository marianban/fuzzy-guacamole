export function buildMultipartPayload(fileName: string, fileContent: Buffer) {
  const boundary = '----fg-test-boundary';
  const start = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      'Content-Type: image/png\r\n\r\n',
    'utf8'
  );
  const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');

  return {
    boundary,
    payload: Buffer.concat([start, fileContent, end])
  };
}
