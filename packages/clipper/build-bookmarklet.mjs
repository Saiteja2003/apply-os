// Builds the bookmarklet from extract.js.
//
//   node packages/clipper/build-bookmarklet.mjs https://your-applyos.example
//
// Writes bookmarklet.txt next to this file. With no argument it targets
// http://localhost:3000.
import { readFileSync, writeFileSync } from "node:fs";
import { Script } from "node:vm";

let appUrl;
try {
  appUrl = new URL(process.argv[2] ?? "http://localhost:3000").origin;
} catch {
  console.error(`"${process.argv[2]}" is not a valid URL. Example: https://applyos.example`);
  process.exit(1);
}
if (!/^https?:\/\//.test(appUrl)) {
  console.error("The ApplyOS address must start with http:// or https://");
  process.exit(1);
}
const here = new URL(".", import.meta.url);

// A bookmark is one line, so full-line comments have to go before the
// newlines do. extract.js keeps every comment on a line of its own.
const extract = readFileSync(new URL("extract.js", here), "utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("//"))
  .join(" ")
  .replace(/;$/, "");

// The job travels in the URL fragment, which is never sent to a server.
// ApplyOS shows it for confirmation before anything is saved. A page that
// cannot be read gets an alert instead of a silent no-op.
const code =
  `(()=>{try{const job=${extract};` +
  `window.open(${JSON.stringify(`${appUrl}/clip#data=`)}+encodeURIComponent(JSON.stringify(job)),"_blank","noopener")` +
  `}catch(e){alert("ApplyOS could not read this page: "+e.message)}})()`;

// Fail the build, not the user's click, if the flattened code is not valid.
try {
  new Script(code);
} catch (error) {
  console.error(`The flattened bookmarklet does not compile: ${error.message}`);
  process.exit(1);
}

// encodeURI leaves "#" alone, and a "#" inside a javascript: URL would start
// a fragment in some browsers and cut the script short.
const bookmarklet = `javascript:${encodeURI(code).replace(/#/g, "%23")}`;
writeFileSync(new URL("bookmarklet.txt", here), `${bookmarklet}\n`);
console.log(
  `Bookmarklet for ${appUrl} written to packages/clipper/bookmarklet.txt (${bookmarklet.length.toLocaleString()} characters)`,
);
