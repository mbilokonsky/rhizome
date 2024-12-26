import Debug from "debug";
import {FSWatcher, readdirSync, readFileSync, watch} from "fs";
import path, {join} from "path";
import {Converter} from "showdown";
const debug = Debug('md-files');

const docConverter = new Converter({
  completeHTMLDocument: true,
  // simpleLineBreaks: true,
  tables: true,
  tasklists: true
});

export const htmlDocFromMarkdown = (md: string): string => docConverter.makeHtml(md);

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

  readFile(name: string) {
    const md = readFileSync(join('./markdown', `${name}.md`)).toString();
    const html = htmlDocFromMarkdown(md);
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
          debug(`file ${name} renamed`);
          // Remove it from memory and re-scan everything
          this.files.delete(name);
          this.readDir();
          break;
        }
        case 'change': {
          debug(`file ${name} changed`);
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
          debug(`README file changed`);
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
