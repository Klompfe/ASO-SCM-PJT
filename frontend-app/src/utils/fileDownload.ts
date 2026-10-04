// base64로 내려온 파일을 브라우저 다운로드로 띄운다(Bearer 인증이 필요해 <a href> 직접 링크를 쓸 수 없다).
export function downloadBase64File(base64: string, filename: string, mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): void {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([array], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
