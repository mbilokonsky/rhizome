import Debug from "debug";
import {FSWatcher, readdirSync, readFileSync, watch} from "fs";
import path, {join} from "path";
import showdown from "showdown";
import {RhizomeNode} from "../node";
const {Converter} = showdown;
const debug = Debug('rz:md-files');

const docConverter = new Converter({
  completeHTMLDocument: true,
  simpleLineBreaks: false,
  tables: true,
  tasklists: true
});

export type Markdown = string;
export type Html = string;

export const htmlDocFromMarkdown = (md: Markdown): Html => docConverter.makeHtml(md);

type mdFileInfo = {
  name: string,
  md: string,
  html: string
};

export class MDFiles {
  files = new Map<string, mdFileInfo>();
  readme?: mdFileInfo;
  dirWatcher?: FSWatcher;
  readmeWatcher?: FSWatcher;
  latestIndexHtml?: Html;

  constructor(readonly rhizomeNode: RhizomeNode) {}

  readFile(name: string) {
    const md = readFileSync(join('./markdown', `${name}.md`)).toString();
    let m = "";

    // Add title and render the markdown
    m += `# File: [${name}](/html/${name})\n\n---\n\n${md}`;

    // Add footer with the nav menu
    m += `\n\n---\n\n${this.generateIndex()}`;

    const html = htmlDocFromMarkdown(m);
    this.files.set(name, {name, md, html});
  }

  readReadme() {
    const md = readFileSync('./README.md').toString();
    const html = htmlDocFromMarkdown(md);
    this.readme = {name: 'README', md, html};
  }

  getReadmeHTML() {
    return this.readme?.html;
  }

  getHtml(name: string): string | undefined {
    return this.files.get(name)?.html;
  }

  list(): string[] {
    return Array.from(this.files.keys());
  }

  generateIndex(): Markdown {
    let md = `# [Index](/html)\n\n`;
    md += `[README](/html/README)\n\n`;
    for (const name of this.list()) {
      md += `- [${name}](/html/${name})\n`;
    }
    return htmlDocFromMarkdown(md);
  }

  get indexHtml(): Html {
    if (!this.latestIndexHtml) {
      this.latestIndexHtml = this.generateIndex();
    }
    return this.latestIndexHtml;
  }

  readDir() {
    // Read list of markdown files from directory and
    // render each markdown file as html
    readdirSync('./markdown/')
      .filter((f) => f.endsWith('.md'))
      .map((name) => path.parse(name).name)
      .forEach((name) => this.readFile(name));
  }

  watchDir() {
    this.dirWatcher = watch('./markdown', null, (eventType, filename) => {
      if (!filename) return;
      if (!filename.endsWith(".md")) return;

      const name = path.parse(filename).name;

      switch (eventType) {
        case 'rename': {
          debug(`[${this.rhizomeNode.config.peerId}]`, `File ${name} renamed`);
          // Remove it from memory and re-scan everything
          this.files.delete(name);
          this.readDir();
          break;
        }
        case 'change': {
          debug(`[${this.rhizomeNode.config.peerId}]`, `File ${name} changed`);
          // Re-read this file
          this.readFile(name)
          break;
        }
      }
    });
  }

  watchReadme() {
    this.readmeWatcher = watch('./README.md', null, (eventType, filename) => {
      if (!filename) return;

      switch (eventType) {
        case 'change': {
          debug(`[${this.rhizomeNode.config.peerId}]`, `README file changed`);
          // Re-read this file
          this.readReadme()
          break;
        }
      }
    });
  }

  close() {
    this.dirWatcher?.close();
    this.readmeWatcher?.close();
  }
}
