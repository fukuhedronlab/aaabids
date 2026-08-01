import "./styles/admin.css";
import { buildShell, content, setActiveNav } from "./ui/shell.js";
import { register, start } from "./ui/router.js";
import { mount, h } from "./lib/dom.js";
import * as wallet from "./lib/wallet.js";

import { render as deploy } from "./panels/deploy.js";
import { render as manage } from "./panels/manage.js";
import { render as status } from "./panels/status.js";

register("deploy", deploy);
register("manage", manage);
register("status", status);

buildShell(document.getElementById("app"));

start((key, render) => {
  setActiveNav();
  try {
    mount(content(), render());
  } catch (e) {
    mount(content(), h("div", { class: "panel" }, h("div", { class: "status err" }, "Panel error: " + (e.message || e))));
  }
});

wallet.tryEager();
