const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const url = "https://news.google.com/rss/articles/CBMixAFBVV95cUxQNzZGb043UnpTWnhVSTBEbS1kb013djdUam15ZHoxTWFacnZpclBrY0lJblhpTDJwTDJZVEN2eF9EaU51aXRMRE9fS2E3VUo1SlBybGhTVUNRTVhNdm9QRXpTTnhfRl9CSkE2cjl5djQ5T1AyNFBSbV94bU5NbTVsd3BPWEFWYmRUU1FvdlFQQmhlemNaT1lOU0VsUjFIVGE4ZkRmcUF6QXdqQTd1ZFZvMmFYT29laTFFTWhBdWptWWVzQnVq?oc=5";
const id = new URL(url).pathname.split("/").pop();
const page = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9" } });
const html = await page.text();
console.log("page", page.status, html.length);
const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
console.log("sg", sg, "ts", ts);
const inner = JSON.stringify([
  "garturlreq",
  [["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[2,3,4,8],1,0,"X",0,0,null,0],
  id, Number(ts), sg,
]);
const payload = "f.req=" + encodeURIComponent(JSON.stringify([[["Fbv4je", inner, null, "generic"]]]));
const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", "user-agent": UA },
  body: payload,
});
const text = await res.text();
console.log("batch", res.status, text.length);
const line = text.split("\n").find((l) => l.startsWith('[["wrb.fr"'));
console.log("line?", !!line);
if (line) {
  const parsed = JSON.parse(line);
  const data = JSON.parse(parsed[0][2]);
  console.log("REAL URL:", data[1]);
}
