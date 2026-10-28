// Pretend Drupal for the Drush window: \Drupal's services, nodes made from
// this site's posts and projects, entity queries (accessCheck and all), t(),
// and a kind word for anyone who still reaches for a Drupal 7 function.
(() => {
  "use strict";
  const { PhpArray, PhpObject, fail, phpDate, randomInt } = MiniPhp;

  const VERSION = "11.x-dev";
  const ago = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    const units = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["min", 60], ["sec", 1]];
    const out = [];
    let rest = s;
    for (const [name, size] of units) {
      if (rest >= size && out.length < 2) {
        const n = Math.floor(rest / size);
        out.push(`${n} ${name}${n === 1 ? "" : "s"}`);
        rest -= n * size;
      }
    }
    return out.join(" ") || "0 sec";
  };
  const uuidFor = (type, id) => {
    const h = MiniPhp.md5(`${type}:${id}`);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };

  MiniPhp.flavors.drupal = (php, data) => {
    const now = () => Math.floor(Date.now() / 1000);
    const siteUrl = data.siteUrl || "https://adrianodias8.github.io/adwebdev";
    const toTs = (date) => Math.floor(Date.parse(`${date}T09:00:00Z`) / 1000);

    // -- Content: posts are articles, projects are projects.
    const posts = [...(data.posts || [])].sort((a, b) => (a.date < b.date ? -1 : 1));
    const store = {
      node: [
        ...posts.map((p) => ({ type: "article", title: p.title, created: toTs(p.date), path: p.url, body: "" })),
        ...(data.projects || []).map((p) => ({ type: "project", title: p.name, created: now() - 86400 * 30, path: `/#info-${p.slug}`, body: p.about })),
      ].map((n, i) => ({ nid: i + 1, uid: 1, status: 1, changed: n.created, ...n })),
      user: [
        { uid: 0, name: "", mail: "", status: 0, created: 1294218000, roles: ["anonymous"] },
        { uid: 1, name: "adriano", mail: data.email || "", status: 1, created: 1294218000, roles: ["authenticated", "administrator"] },
      ],
    };
    const ids = { node: "nid", user: "uid" };
    const messages = [];
    const state = new Map([["system.cron_last", now() - 3600], ["install_time", 1294218000], ["system.maintenance_mode", 0]]);
    const config = {
      "system.site": { name: "adwebdev", slogan: "Drupal & Laravel sites, built and looked after.", mail: data.email || "", page: { front: "/node", 403: "", 404: "/404" } },
      "system.theme": { default: "phosphor", admin: "claro" },
      "system.performance": { cache: { page: { max_age: 3600 } }, css: { preprocess: true }, js: { preprocess: true } },
      "core.extension": { profile: "minimal" },
    };
    const modules = { node: true, user: true, system: true, views: true, field: true, text: true, path: true, block: true, filter: true, admin_toolbar: true, pathauto: true, devel: false, layout_builder: false, adwebdev_desktop: true };

    const toPhp = (v) => (Array.isArray(v) ? PhpArray.of(v.map(toPhp)) : v && typeof v === "object" ? PhpArray.from(Object.entries(v).map(([k, x]) => [k, toPhp(x)])) : v);
    const field = (value) => {
      const f = new PhpObject("Drupal\\Core\\Field\\FieldItemList");
      f.props.set("value", value);
      f.dumpEntries = () => [["value", value]];
      f.toStr = () => php.str(value);
      f.methods = {
        getvalue: () => PhpArray.of([PhpArray.from([["value", value]])]),
        getstring: () => php.str(value),
        isempty: () => value === null || value === "",
        first: () => f,
        count: () => (value === null ? 0 : 1),
      };
      return f;
    };
    const url = (path, absolute = false) => {
      const u = new PhpObject("Drupal\\Core\\Url");
      let abs = absolute;
      u.dumpEntries = () => [["path", path]];
      u.methods = {
        tostring: () => (abs ? siteUrl + path : path),
        setabsolute: ([on = true]) => { abs = php.truthy(on); return u; },
        getinternalpath: () => path.replace(/^\//, ""),
        isexternal: () => false,
        isrouted: () => true,
      };
      u.toStr = () => u.methods.tostring([]);
      return u;
    };

    function entity(type, row, isNew = false) {
      const key = ids[type];
      const e = new PhpObject(type === "node" ? "Drupal\\node\\Entity\\Node" : "Drupal\\user\\Entity\\User");
      e.row = { ...row };
      e.isNew = isNew;
      e.dumpEntries = () => (type === "node"
        ? [["nid", e.row.nid ?? null], ["type", e.row.type], ["title", e.row.title], ["status", !!e.row.status], ["uid", e.row.uid], ["created", e.row.created], ["path", e.row.path ?? null]]
        : [["uid", e.row.uid], ["name", e.row.name], ["mail", e.row.mail], ["status", !!e.row.status], ["roles", toPhp(e.row.roles)]]);
      e.toJson = () => PhpArray.from(e.dumpEntries());
      const save = () => {
        const list = store[type];
        if (e.isNew) {
          e.row[key] = list.reduce((m, r) => Math.max(m, r[key]), 0) + 1;
          e.row.created ??= now();
          e.row.changed = now();
          if (type === "node") e.row.path ??= `/node/${e.row.nid}`;
          list.push({ ...e.row });
          e.isNew = false;
          return 1;
        }
        const i = list.findIndex((r) => r[key] === e.row[key]);
        e.row.changed = now();
        if (i >= 0) list[i] = { ...e.row };
        return 2;
      };
      e.methods = {
        id: () => (e.row[key] ?? null),
        uuid: () => uuidFor(type, e.row[key]),
        label: () => (type === "node" ? e.row.title : e.row.name),
        bundle: () => (type === "node" ? e.row.type : "user"),
        getentitytypeid: () => type,
        isnew: () => e.isNew,
        save: () => save(),
        delete: () => { const list = store[type]; const i = list.findIndex((r) => r[key] === e.row[key]); if (i >= 0) list.splice(i, 1); return null; },
        get: ([name]) => field(e.row[php.str(name)] ?? null),
        set: ([name, v]) => { e.row[php.str(name)] = v instanceof PhpObject && v.props.has("value") ? v.props.get("value") : v; return e; },
        hasfield: ([name]) => php.str(name) in e.row,
        toarray: () => e.toJson(),
        tourl: () => url(e.row.path || `/${type}/${e.row[key]}`),
        access: () => true,
        getcachetags: () => PhpArray.of([`${type}:${e.row[key]}`]),
        // Nodes
        gettitle: () => e.row.title,
        settitle: ([t]) => { e.row.title = php.str(t); return e; },
        gettype: () => e.row.type,
        ispublished: () => !!e.row.status,
        setpublished: () => { e.row.status = 1; return e; },
        setunpublished: () => { e.row.status = 0; return e; },
        getcreatedtime: () => e.row.created,
        setcreatedtime: ([t]) => { e.row.created = php.num(t); return e; },
        getchangedtime: () => e.row.changed,
        getownerid: () => e.row.uid,
        getowner: () => entity("user", store.user.find((u) => u.uid === e.row.uid)),
        ispromoted: () => true,
        issticky: () => false,
        // Users
        getaccountname: () => e.row.name,
        getdisplayname: () => (e.row.uid === 1 ? "Adriano Dias" : e.row.name || "Anonymous"),
        getemail: () => e.row.mail,
        getroles: () => PhpArray.of(e.row.roles || []),
        hasrole: ([r]) => (e.row.roles || []).includes(php.str(r)),
        haspermission: () => e.row.uid === 1,
        isauthenticated: () => e.row.uid > 0,
        isanonymous: () => e.row.uid === 0,
        isactive: () => !!e.row.status,
        isblocked: () => !e.row.status,
      };
      e.getProp = (name) => (name in e.row ? field(e.row[name]) : name === "body" ? field("") : undefined);
      e.setProp = (name, v) => { e.row[name] = v instanceof PhpObject && v.props.has("value") ? v.props.get("value") : v; };
      return e;
    }

    function entityQuery(type) {
      const q = new PhpObject(`Drupal\\Core\\Entity\\Query\\Sql\\Query`);
      const st = { conds: [], sorts: [], range: null, count: false, access: null };
      q.dumpEntries = () => [["entityTypeId", type]];
      q.methods = {
        condition: ([f, v, op = "="]) => { st.conds.push([php.str(f), v, php.str(op).toUpperCase()]); return q; },
        exists: ([f]) => { st.conds.push([php.str(f), null, "IS NOT NULL"]); return q; },
        notexists: ([f]) => { st.conds.push([php.str(f), null, "IS NULL"]); return q; },
        sort: ([f, dir = "ASC"]) => { st.sorts.push([php.str(f), php.str(dir).toUpperCase()]); return q; },
        range: ([start = 0, len = null]) => { st.range = [php.num(start), len === null ? null : php.num(len)]; return q; },
        pager: ([n = 10]) => { st.range = [0, php.num(n)]; return q; },
        count: () => { st.count = true; return q; },
        accesscheck: ([on = true]) => { st.access = php.truthy(on); return q; },
        execute: () => {
          if (st.access === null) fail("Drupal\\Core\\Entity\\Query\\QueryException", "Entity queries must explicitly set whether the query should be access checked or not. See Drupal\\Core\\Entity\\Query\\QueryInterface::accessCheck()");
          let rows = store[type].filter((r) => (type !== "user" || r.uid > 0) && st.conds.every(([f, v, op]) => {
            const x = f === "title" || f === "name" ? r[f] : r[f] ?? null;
            switch (op) {
              case "=": return php.looseEq(x, v);
              case "<>": case "!=": return !php.looseEq(x, v);
              case ">": return php.compare(x, v) > 0;
              case "<": return php.compare(x, v) < 0;
              case ">=": return php.compare(x, v) >= 0;
              case "<=": return php.compare(x, v) <= 0;
              case "IN": return (v instanceof PhpArray ? v.values() : [v]).some((y) => php.looseEq(x, y));
              case "NOT IN": return !(v instanceof PhpArray ? v.values() : [v]).some((y) => php.looseEq(x, y));
              case "CONTAINS": return php.str(x).toLowerCase().includes(php.str(v).toLowerCase());
              case "STARTS_WITH": return php.str(x).startsWith(php.str(v));
              case "ENDS_WITH": return php.str(x).endsWith(php.str(v));
              case "IS NULL": return x === null;
              case "IS NOT NULL": return x !== null;
              default: fail("Drupal\\Core\\Entity\\Query\\QueryException", `Operator ${op} is not supported here`);
            }
          }));
          if (st.count) return rows.length;
          for (const [f, dir] of [...st.sorts].reverse()) rows = [...rows].sort((a, b) => (dir === "DESC" ? -1 : 1) * php.compare(a[f], b[f]));
          if (st.range) rows = rows.slice(st.range[0], st.range[1] === null ? undefined : st.range[0] + st.range[1]);
          return PhpArray.from(rows.map((r) => [r[ids[type]], String(r[ids[type]])]));
        },
      };
      return q;
    }

    function storage(type) {
      if (!store[type]) fail("Drupal\\Component\\Plugin\\Exception\\PluginNotFoundException", `The "${type}" entity type does not exist.`);
      const key = ids[type];
      const s = new PhpObject(type === "node" ? "Drupal\\node\\NodeStorage" : "Drupal\\user\\UserStorage");
      const load = (id) => { const r = store[type].find((x) => php.looseEq(x[key], id)); return r ? entity(type, r) : null; };
      s.dumpEntries = () => [["entityTypeId", type]];
      s.methods = {
        load: ([id]) => load(id),
        loadmultiple: ([list = null]) => PhpArray.from((list === null ? store[type].map((r) => r[key]) : list.values()).map((id) => [id, load(id)]).filter(([, e]) => e)),
        loadbyproperties: ([props]) => PhpArray.from(store[type].filter((r) => props.entries().every(([k, v]) => php.looseEq(r[k], v))).map((r) => [r[key], entity(type, r)])),
        create: ([values]) => entity(type, Object.fromEntries((values || new PhpArray()).entries().map(([k, v]) => [k, v instanceof PhpArray ? v.values()[0] : v])), true),
        getquery: () => entityQuery(type),
        delete: ([list]) => { for (const e of list.values()) e.methods.delete([]); return null; },
        resetcache: () => null,
      };
      return s;
    }

    const obj = (cls, methods) => { const o = new PhpObject(cls); o.methods = methods; o.dumpEntries = () => []; return o; };
    const messenger = obj("Drupal\\Core\\Messenger\\Messenger", {});
    const say = (type, cls) => ([m]) => { messages.push([type, php.str(m)]); php.note(` [${type}] ${php.str(m)}`, cls); return messenger; };
    Object.assign(messenger.methods, {
      addmessage: ([m, type = "status"]) => say(php.str(type), php.str(type) === "error" ? "is-error" : php.str(type) === "warning" ? "is-warn" : "is-ok")([m]),
      addstatus: say("status", "is-ok"),
      addwarning: say("warning", "is-warn"),
      adderror: say("error", "is-error"),
      all: () => { const out = new PhpArray(); for (const [t, m] of messages) { if (!out.has(t)) out.set(t, new PhpArray()); out.get(t).push(m); } return out; },
      deleteall: () => { const all = messenger.methods.all([]); messages.length = 0; return all; },
    });
    const configObj = (name, editable = false) => {
      const data = config[name] || {};
      const c = obj(editable ? "Drupal\\Core\\Config\\Config" : "Drupal\\Core\\Config\\ImmutableConfig", {});
      c.dumpEntries = () => [["name", name]];
      Object.assign(c.methods, {
        get: ([k = ""]) => { if (!php.str(k)) return toPhp(data); let v = data; for (const part of php.str(k).split(".")) v = v?.[part]; return toPhp(v ?? null); },
        getrawdata: () => toPhp(data),
        set: ([k, v]) => { if (!editable) fail("Drupal\\Core\\Config\\ImmutableConfigException", `Can not set values on immutable configuration ${name}:${php.str(k)}. Use \\Drupal\\Core\\Config\\ConfigFactoryInterface::getEditable() to retrieve a mutable configuration object`); const parts = php.str(k).split("."); let t = (config[name] ??= {}); while (parts.length > 1) t = t[parts.shift()] ??= {}; t[parts[0]] = php.toJs(v); return c; },
        save: () => c,
        getname: () => name,
        isnew: () => !(name in config),
      });
      return c;
    };
    const currentUser = obj("Drupal\\Core\\Session\\AccountProxy", {});
    Object.assign(currentUser.methods, entity("user", store.user[1]).methods);
    const dateFormatter = obj("Drupal\\Core\\Datetime\\DateFormatter", {
      format: ([ts, type = "medium", fmt = ""]) => {
        const formats = { short: "m/d/Y - H:i", medium: "D, m/d/Y - H:i", long: "l, F j, Y - H:i", html_date: "Y-m-d", html_datetime: "Y-m-d\\TH:i:sO" };
        return phpDate(php.str(type) === "custom" ? php.str(fmt) : formats[php.str(type)] || formats.medium, php.num(ts) * 1000);
      },
      formattimediffsince: ([ts]) => ago(Date.now() - php.num(ts) * 1000),
      formattimediffuntil: ([ts]) => ago(php.num(ts) * 1000 - Date.now()),
      formatinterval: ([s]) => ago(php.num(s) * 1000),
    });
    const time = obj("Drupal\\Component\\Datetime\\Time", {
      getrequesttime: () => now(),
      getcurrenttime: () => now(),
      getrequestmicrotime: () => Date.now() / 1000,
      getcurrentmicrotime: () => Date.now() / 1000,
    });
    const stateObj = obj("Drupal\\Core\\State\\State", {
      get: ([k, d = null]) => (state.has(php.str(k)) ? state.get(php.str(k)) : d),
      set: ([k, v]) => { state.set(php.str(k), v); return null; },
      delete: ([k]) => { state.delete(php.str(k)); return null; },
      getmultiple: ([keys]) => PhpArray.from(keys.values().map((k) => [k, state.get(php.str(k)) ?? null])),
    });
    const noDatabase = () => fail("Drupal\\Core\\Database\\ConnectionNotDefinedException", "The specified database connection is not defined: default", "There is no database: this Drupal is pretend, and the site is static files.");
    const database = obj("Drupal\\Core\\Database\\Connection", Object.fromEntries(["query", "select", "insert", "update", "delete", "merge", "schema", "truncate", "upsert"].map((m) => [m, noDatabase])));
    const moduleHandler = obj("Drupal\\Core\\Extension\\ModuleHandler", {
      moduleexists: ([m]) => !!modules[php.str(m)],
      getmodulelist: () => PhpArray.from(Object.entries(modules).filter(([, on]) => on).map(([m]) => [m, m])),
      invokeall: () => new PhpArray(),
      hasimplementations: () => false,
    });
    const etm = obj("Drupal\\Core\\Entity\\EntityTypeManager", {
      getstorage: ([t]) => storage(php.str(t)),
      hasdefinition: ([t]) => php.str(t) in store,
      getdefinitions: () => PhpArray.from(Object.keys(store).map((t) => [t, t])),
    });
    const logger = (channel) => obj("Drupal\\Core\\Logger\\LoggerChannel", Object.fromEntries(["emergency", "alert", "critical", "error", "warning", "notice", "info", "debug", "log"].map((l) => [l, () => null])));
    const language = obj("Drupal\\Core\\Language\\Language", { getid: () => "en", getname: () => "English", getdirection: () => "ltr", isdefault: () => true });
    const services = {
      "date.formatter": dateFormatter,
      "datetime.time": time,
      messenger,
      state: stateObj,
      current_user: currentUser,
      "entity_type.manager": etm,
      "module_handler": moduleHandler,
      database,
      "config.factory": obj("Drupal\\Core\\Config\\ConfigFactory", { get: ([n]) => configObj(php.str(n)), geteditable: ([n]) => configObj(php.str(n), true), listall: () => PhpArray.of(Object.keys(config)) }),
      "logger.factory": obj("Drupal\\Core\\Logger\\LoggerChannelFactory", { get: ([c]) => logger(php.str(c)) }),
      "language_manager": obj("Drupal\\Core\\Language\\LanguageManager", { getcurrentlanguage: () => language, getdefaultlanguage: () => language, getlanguages: () => PhpArray.from([["en", language]]) }),
      uuid: obj("Drupal\\Component\\Uuid\\Php", { generate: () => crypto.randomUUID() }),
      "path_alias.manager": obj("Drupal\\path_alias\\AliasManager", { getaliasbypath: ([p]) => { const n = /^\/node\/(\d+)$/.exec(php.str(p)); const r = n && store.node.find((x) => x.nid === Number(n[1])); return r ? r.path : php.str(p); } }),
      "cache.default": obj("Drupal\\Core\\Cache\\MemoryBackend", { get: () => false, set: () => null, delete: () => null, invalidateall: () => null }),
    };
    const service = (id) => services[php.str(id)] || fail("Symfony\\Component\\DependencyInjection\\Exception\\ServiceNotFoundException", `You have requested a non-existent service "${php.str(id)}".`);

    const drupal = {
      name: "Drupal",
      constants: { VERSION, CORE_COMPATIBILITY: "11.x" },
      statics: {
        service: ([id]) => service(id),
        hasservice: ([id]) => php.str(id) in services,
        entitytypemanager: () => etm,
        entityquery: ([t]) => entityQuery(php.str(t)),
        config: ([n]) => configObj(php.str(n)),
        configfactory: () => services["config.factory"],
        state: () => stateObj,
        messenger: () => messenger,
        currentuser: () => currentUser,
        time: () => time,
        database: () => database,
        modulehandler: () => moduleHandler,
        languagemanager: () => services.language_manager,
        logger: ([c]) => logger(php.str(c)),
        cache: () => services["cache.default"],
        root: () => "/var/www/html/web",
        isconfigsyncing: () => false,
        token: () => obj("Drupal\\Core\\Utility\\Token", { replace: ([t]) => php.str(t).replace(/\[site:name\]/g, "adwebdev").replace(/\[site:url\]/g, siteUrl).replace(/\[current-date:short\]/g, phpDate("m/d/Y - H:i", Date.now())) }),
        request: () => fail("Error", "\\Drupal::request() has no request here", "A static site answers no requests. Try \\Drupal::time() or \\Drupal::config('system.site')."),
        translation: () => obj("Drupal\\Core\\StringTranslation\\TranslationManager", { translate: ([s]) => php.str(s) }),
      },
    };
    const entityClass = (type, cls) => ({
      name: cls,
      statics: {
        load: ([id]) => storage(type).methods.load([id]),
        loadmultiple: ([list = null]) => storage(type).methods.loadmultiple([list]),
        create: ([values]) => storage(type).methods.create([values]),
      },
    });
    php.classes = {
      ...php.classes,
      drupal,
      node: entityClass("node", "Drupal\\node\\Entity\\Node"),
      user: entityClass("user", "Drupal\\user\\Entity\\User"),
      url: {
        name: "Drupal\\Core\\Url",
        statics: {
          fromroute: ([route, params]) => {
            const r = php.str(route);
            if (r === "<front>") return url("/");
            if (r === "user.login") return url("/user/login");
            if (r === "entity.node.canonical") { const id = params?.get("node"); const n = store.node.find((x) => php.looseEq(x.nid, id)); return url(n ? n.path : `/node/${php.str(id)}`); }
            if (r === "system.admin") return url("/admin");
            return fail("Symfony\\Component\\Routing\\Exception\\RouteNotFoundException", `Route "${r}" does not exist.`);
          },
          fromuserinput: ([p]) => url(php.str(p)),
          fromuri: ([u]) => url(php.str(u).replace(/^internal:/, "")),
        },
      },
      link: { name: "Drupal\\Core\\Link", statics: { fromtextandurl: ([text, u]) => obj("Drupal\\Core\\Link", { tostring: () => `<a href="${u.methods.tostring([])}">${php.builtins.htmlspecialchars([text], php)}</a>`, gettext: () => text, geturl: () => u }) } },
      html: { name: "Drupal\\Component\\Utility\\Html", statics: { escape: ([s]) => php.builtins.htmlspecialchars([s], php), getid: ([s]) => php.str(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), getclass: ([s]) => php.str(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), cleancssidentifier: ([s]) => php.str(s).toLowerCase().replace(/[ _[\]]/g, "-").replace(/[^a-z0-9-]/g, "") } },
      xss: { name: "Drupal\\Component\\Utility\\Xss", statics: { filter: ([s]) => php.str(s).replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<(?!\/?(a|em|strong|cite|blockquote|code|ul|ol|li|dl|dt|dd)\b)[^>]*>/gi, ""), filteradmin: ([s]) => php.str(s).replace(/<script\b[\s\S]*?<\/script>/gi, "") } },
      unicode: { name: "Drupal\\Component\\Utility\\Unicode", statics: { truncate: ([s, n, wordsafe = false, dots = false]) => { s = php.str(s); if (s.length <= php.num(n)) return s; let t = s.slice(0, php.num(n) - (php.truthy(dots) ? 1 : 0)); if (php.truthy(wordsafe)) t = t.replace(/\s+\S*$/, ""); return t + (php.truthy(dots) ? "…" : ""); }, ucfirst: ([s]) => php.str(s).charAt(0).toUpperCase() + php.str(s).slice(1) } },
    };
    Object.assign(php.constants, { SAVED_NEW: 1, SAVED_UPDATED: 2, SAVED_DELETED: 3, DRUPAL_ROOT: "/var/www/html/web", REQUEST_TIME: now() });

    Object.assign(php.builtins, {
      t: ([s, args]) => {
        let out = php.str(s);
        if (args instanceof PhpArray) for (const [k, v] of args.entries()) out = out.split(String(k)).join(String(k).startsWith("%") ? `<em class="placeholder">${php.str(v)}</em>` : php.str(v));
        return out;
      },
      drupal_flush_all_caches: () => { php.note(" [success] Caches flushed (all zero of them).", "is-ok"); return null; },
      watchdog_exception: () => null,
    });

    // What the Drush shell reads and changes, so both agree.
    php.drupal = { VERSION, store, state, config, modules, messages };

    const d7 = (instead, version = "9") => `A Drupal 7 function, removed in Drupal ${version}. ${instead}`;
    php.hints = {
      drupal_set_message: d7("Use \\Drupal::messenger()->addMessage()."),
      node_load: d7("Use Node::load($nid)."),
      node_load_multiple: d7("Use Node::loadMultiple()."),
      node_save: d7("Use $node->save()."),
      user_load: d7("Use User::load($uid)."),
      entity_load: d7("Use \\Drupal::entityTypeManager()->getStorage($type)->load()."),
      variable_get: d7("Use \\Drupal::config() for settings, or \\Drupal::state() for values that change.", "8"),
      variable_set: d7("Use \\Drupal::configFactory()->getEditable() or \\Drupal::state()->set().", "8"),
      variable_del: d7("Use \\Drupal::state()->delete().", "8"),
      db_query: d7("Use \\Drupal::database()->query()."),
      db_select: d7("Use \\Drupal::database()->select()."),
      db_insert: d7("Use \\Drupal::database()->insert()."),
      drupal_goto: d7("Return a RedirectResponse from your controller.", "8"),
      drupal_render: d7("Use \\Drupal::service('renderer')->render()."),
      format_date: d7("Use \\Drupal::service('date.formatter')->format()."),
      check_plain: d7("Use Html::escape().", "8"),
      l: d7("Use Link::fromTextAndUrl().", "8"),
      url: d7("Use Url::fromRoute() or Url::fromUserInput().", "8"),
      theme: d7("Build a render array with #theme.", "8"),
      menu_get_object: d7("Use \\Drupal::routeMatch()->getParameter('node').", "8"),
      drupal_get_path: d7("Use \\Drupal::service('extension.list.module')->getPath().", "10"),
      file_create_url: d7("Use \\Drupal::service('file_url_generator')->generateAbsoluteString().", "10"),
      cache_clear_all: d7("Use drupal_flush_all_caches(), or drush cr.", "8"),
      hook_menu: "hook_menu() became routing.yml files in Drupal 8. It is missed.",
      entityquery: "In Drupal 10 and 11: \\Drupal::entityQuery('node') or the storage's getQuery().",
    };
  };

  MiniPhp.drupal = { VERSION };
})();
