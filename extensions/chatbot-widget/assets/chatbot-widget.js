/**
 * AI Chatbot — Theme App Extension
 * -----------------------------------------------------------------------
 * Vanilla JS, no dependencies. One instance per page.
 *
 * Conversation state lives in the backend DB, keyed by conversationId.
 * The browser only ever remembers the bare conversationId (localStorage),
 * never message content. On load, if an id exists, full history is
 * fetched from the server and re-rendered.
 */
(function () {
    "use strict";

    /* ------------------------------------------------------------------
     * Tool -> human status text, shown while a tool call is in flight
     * ------------------------------------------------------------------ */
    var TOOL_STATUS_TEXT = {
        search_catalog: "Searching products…",
        lookup_catalog: "Looking up products…",
        get_product: "Fetching product details…",
        get_cart: "Checking your cart…",
        create_cart: "Creating your cart…",
        update_cart: "Updating your cart…",
        cancel_cart: "Clearing your cart…",
    };
    function toolStatusText(toolName) {
        return TOOL_STATUS_TEXT[toolName] || "Working on it…";
    }

    // A single turn can call multiple cart-affecting tools (e.g. get_cart
    // to check state, then update_cart to change it). Only the LAST one
    // reflects reality — earlier ones are intermediate and shouldn't be
    // shown as separate cards.
    var CART_TOOLS = ["get_cart", "create_cart", "update_cart", "cancel_cart"];

    /* ------------------------------------------------------------------
 * Minimal markdown -> HTML for bot text: links + bold only.
 * Escapes HTML first so nothing from the model/user can inject markup,
 * then converts [label](url) and **bold**.
 * ------------------------------------------------------------------ */
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function renderMarkdownLite(text) {
        var html = escapeHtml(text);
        html = html.replace(
            /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
            '<a href="$2" target="_blank" rel="noopener">$1</a>'
        );
        html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        return html;
    }

    /* ------------------------------------------------------------------
     * AIChatbotStorage — remembers ONLY the conversationId, per shop.
     * No message content ever touches the browser's persistent storage.
     * ------------------------------------------------------------------ */
    function AIChatbotStorage(shop) {
        this.key = "ai-chatbot-conversation-id:" + shop;
    }
    AIChatbotStorage.prototype.getConversationId = function () {
        try {
            return window.localStorage.getItem(this.key);
        } catch (e) {
            return null;
        }
    };
    AIChatbotStorage.prototype.setConversationId = function (id) {
        try {
            window.localStorage.setItem(this.key, id);
        } catch (e) {
            /* private mode / quota — fail silently, session still works */
        }
    };
    AIChatbotStorage.prototype.clearConversationId = function () {
        try {
            window.localStorage.removeItem(this.key);
        } catch (e) {
            /* no-op */
        }
    };

    /* ------------------------------------------------------------------
     * AIChatbotAPI — talks to the backend
     * ------------------------------------------------------------------ */
    function AIChatbotAPI(apiBase, shop) {
        this.apiBase = apiBase.replace(/\/$/, "");
        this.shop = shop;
    }

    AIChatbotAPI.prototype.fetchHistory = function (conversationId) {
        var url =
            this.apiBase +
            "/history?shop=" +
            encodeURIComponent(this.shop) +
            (conversationId
                ? "&conversationId=" + encodeURIComponent(conversationId)
                : "");
        return fetch(url).then(function (res) {
            if (!res.ok) throw new Error("Failed to load history");
            return res.json();
        });
    };

    AIChatbotAPI.prototype.fetchStarterQuestions = function () {
        var url = this.apiBase + "/questions/" + encodeURIComponent(this.shop);
        return fetch(url).then(function (res) {
            if (!res.ok) throw new Error("Failed to load starter questions");
            return res.json();
        });
    };

    AIChatbotAPI.prototype.addToCart = function (payload) {
        return fetch(this.apiBase + "/cart/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
                Object.assign({ shop: this.shop }, payload)
            ),
        }).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) throw new Error(data.error || "Failed to add to cart");
                return data;
            });
        });
    };

    // Streams /chat via fetch + ReadableStream (SSE format, but POST body
    // means EventSource can't be used). Calls handlers.onEvent(evt) for
    // every parsed `data: {...}` line.
    AIChatbotAPI.prototype.streamChat = function (message, conversationId, handlers) {
        var self = this;
        return fetch(this.apiBase + "/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shop: self.shop,
                message: message,
                conversationId: conversationId || undefined,
            }),
        }).then(function (res) {
            if (!res.ok || !res.body) throw new Error("Chat request failed");
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var buffer = "";

            function pump() {
                return reader.read().then(function (result) {
                    if (result.done) return;
                    buffer += decoder.decode(result.value, { stream: true });
                    var parts = buffer.split("\n\n");
                    buffer = parts.pop();
                    for (var i = 0; i < parts.length; i++) {
                        var line = parts[i].trim();
                        if (line.indexOf("data:") !== 0) continue;
                        var jsonStr = line.slice(5).trim();
                        if (!jsonStr) continue;
                        try {
                            handlers.onEvent(JSON.parse(jsonStr));
                        } catch (e) {
                            /* malformed chunk — skip */
                        }
                    }
                    return pump();
                });
            }
            return pump();
        });
    };

    /* ------------------------------------------------------------------
     * ProductRenderer — formats catalog/cart tool results into markup.
     * These are the "helper functions to format products" — kept isolated
     * so the card design can change without touching event wiring.
     * ------------------------------------------------------------------ */
    var ProductRenderer = {
        formatMoney: function (amount, currency) {
            if (amount == null) return "";
            var major = amount / 100;
            var formatted = major.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            });
            return formatted + " " + (currency || "");
        },

        // Builds one product card. `product` is the full (unshrunk) shape
        // from search_catalog/lookup_catalog/get_product structuredContent.
        buildProductCard: function (product, onAddToCart, onBuyNow) {
            var self = this;
            var variants = product.variants || [];
            function isVariantAvailable(v) {
                return !v.availability || v.availability.available !== false;
            }
            var initialVariant =
                variants.find(function (v) {
                    return v.selected && isVariantAvailable(v);
                }) ||
                variants.find(isVariantAvailable) ||
                variants[0] ||
                null;

            var card = document.createElement("div");
            card.className = "ai-chatbot__product-card";

            var media = document.createElement("div");
            media.className = "ai-chatbot__product-card-media";

            var img = document.createElement("img");
            img.loading = "lazy";
            img.alt = product.title || "";
            media.appendChild(img);

            var actions = document.createElement("div");
            actions.className = "ai-chatbot__product-card-actions";

            var cartBtn = document.createElement("button");
            cartBtn.type = "button";
            cartBtn.className = "ai-chatbot__product-card-action";
            cartBtn.setAttribute("aria-label", "Add to cart");
            cartBtn.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 4H5L6.6 14.2C6.8 15.3 7.8 16 8.9 16H17.5C18.5 16 19.5 15.3 19.7 14.3L21 7H6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="20" r="1.3" fill="currentColor"/><circle cx="17" cy="20" r="1.3" fill="currentColor"/></svg>';

            var buyBtn = document.createElement("button");
            buyBtn.type = "button";
            buyBtn.className = "ai-chatbot__product-card-action ai-chatbot__product-card-action--buy";
            buyBtn.setAttribute("aria-label", "Buy now");
            buyBtn.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13 2L4 14H12L11 22L20 10H12L13 2Z" fill="currentColor"/></svg>';

            actions.appendChild(cartBtn);
            actions.appendChild(buyBtn);
            media.appendChild(actions);

            var body = document.createElement("div");
            body.className = "ai-chatbot__product-card-body";

            var titleEl = document.createElement("div");
            titleEl.className = "ai-chatbot__product-card-title";

            var priceEl = document.createElement("div");
            priceEl.className = "ai-chatbot__product-card-price";

            body.appendChild(titleEl);
            body.appendChild(priceEl);

            var currentVariant = initialVariant;

            function applyVariant(variant) {
                currentVariant = variant;
                var img_url =
                    (variant && variant.media && variant.media[0] && variant.media[0].url) ||
                    (product.media && product.media[0] && product.media[0].url) ||
                    "";
                var title = (variant && variant.title) || product.title || "";
                var priceAmount =
                    (variant && variant.price && variant.price.amount) ??
                    (product.price_range && product.price_range.min && product.price_range.min.amount);
                var currency =
                    (variant && variant.price && variant.price.currency) ||
                    (product.price_range && product.price_range.min && product.price_range.min.currency);
                var comparePriceAmount =
                    (variant && variant.list_price && variant.list_price.amount) ||
                    (product.list_price_range && product.list_price_range.min && product.list_price_range.min.amount) ||
                    0;

                img.src = img_url;
                titleEl.textContent = product.title || title;

                priceEl.innerHTML = "";
                var currentSpan = document.createElement("span");
                currentSpan.className = "ai-chatbot__product-card-price-current";
                currentSpan.textContent = self.formatMoney(priceAmount, currency);
                priceEl.appendChild(currentSpan);

                if (comparePriceAmount > priceAmount) {
                    var compareSpan = document.createElement("span");
                    compareSpan.className = "ai-chatbot__product-card-price-compare";
                    compareSpan.textContent = self.formatMoney(comparePriceAmount, currency);
                    priceEl.appendChild(compareSpan);
                }
            }

            applyVariant(initialVariant);

            if (variants.length > 1) {
                var badgesWrap = document.createElement("div");
                badgesWrap.className = "ai-chatbot__product-card-badges-wrap";

                var badges = document.createElement("div");
                badges.className = "ai-chatbot__product-card-badges";

                // Figure out which option positions actually differ between
                // variants (e.g. size) vs. which are identical across all of
                // them (e.g. every variant being "Stitched"). Shared values
                // add no information on the badge and just make it longer,
                // so we drop them from the label.
                var optionCount = 0;
                variants.forEach(function (v) {
                    optionCount = Math.max(optionCount, (v.options || []).length);
                });
                var variesAtIndex = [];
                for (var i = 0; i < optionCount; i++) {
                    var firstVal;
                    var seenFirst = false;
                    var varies = false;
                    for (var j = 0; j < variants.length; j++) {
                        var opt = (variants[j].options || [])[i];
                        var val = opt ? opt.label : undefined;
                        if (!seenFirst) {
                            firstVal = val;
                            seenFirst = true;
                        } else if (val !== firstVal) {
                            varies = true;
                            break;
                        }
                    }
                    variesAtIndex[i] = varies;
                }

                variants.forEach(function (variant) {
                    var isAvailable = !variant.availability || variant.availability.available !== false;

                    var badge = document.createElement("button");
                    badge.type = "button";
                    badge.className = "ai-chatbot__badge";
                    if (!isAvailable) badge.classList.add("is-unavailable");
                    if (variant === initialVariant) badge.classList.add("is-selected");

                    var allOptionLabels = (variant.options || []).map(function (o) {
                        return o.label;
                    });
                    var distinguishingLabels = allOptionLabels.filter(function (_, idx) {
                        return variesAtIndex[idx];
                    });
                    var label =
                        (distinguishingLabels.length ? distinguishingLabels : allOptionLabels).join(" / ") ||
                        variant.title;
                    badge.textContent = label;

                    if (!isAvailable) {
                        badge.disabled = true;
                        badge.setAttribute("aria-disabled", "true");
                        badge.title = "Currently unavailable";
                    } else {
                        badge.addEventListener("click", function (e) {
                            e.stopPropagation();
                            applyVariant(variant);
                            var siblings = badges.querySelectorAll(".ai-chatbot__badge");
                            for (var i = 0; i < siblings.length; i++) {
                                siblings[i].classList.remove("is-selected");
                            }
                            badge.classList.add("is-selected");
                        });
                    }

                    badges.appendChild(badge);
                });

                badgesWrap.appendChild(badges);

                var prevBadgeBtn = document.createElement("button");
                prevBadgeBtn.type = "button";
                prevBadgeBtn.className = "ai-chatbot__badges-nav-btn ai-chatbot__badges-nav-btn--prev is-hidden";
                prevBadgeBtn.setAttribute("aria-label", "Show earlier options");
                prevBadgeBtn.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

                var nextBadgeBtn = document.createElement("button");
                nextBadgeBtn.type = "button";
                nextBadgeBtn.className = "ai-chatbot__badges-nav-btn ai-chatbot__badges-nav-btn--next is-hidden";
                nextBadgeBtn.setAttribute("aria-label", "Show more options");
                nextBadgeBtn.innerHTML =
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

                badgesWrap.appendChild(prevBadgeBtn);
                badgesWrap.appendChild(nextBadgeBtn);

                prevBadgeBtn.addEventListener("click", function (e) {
                    e.stopPropagation();
                    badges.scrollBy({ left: -50, behavior: "smooth" });
                });
                nextBadgeBtn.addEventListener("click", function (e) {
                    e.stopPropagation();
                    badges.scrollBy({ left: 50, behavior: "smooth" });
                });

                function updateBadgesNav() {
                    var maxScroll = badges.scrollWidth - badges.clientWidth;
                    if (maxScroll <= 1) {
                        badgesWrap.classList.remove("has-overflow");
                        prevBadgeBtn.classList.add("is-hidden");
                        nextBadgeBtn.classList.add("is-hidden");
                        return;
                    }
                    badgesWrap.classList.add("has-overflow");
                    prevBadgeBtn.classList.toggle("is-hidden", badges.scrollLeft <= 1);
                    nextBadgeBtn.classList.toggle("is-hidden", badges.scrollLeft >= maxScroll - 1);
                }

                badges.addEventListener("scroll", function () {
                    window.requestAnimationFrame(updateBadgesNav);
                });
                window.requestAnimationFrame(function () {
                    window.requestAnimationFrame(updateBadgesNav);
                });
                window.addEventListener("resize", updateBadgesNav);

                body.appendChild(badgesWrap);
            }

            card.appendChild(media);
            card.appendChild(body);

            card.addEventListener("click", function () {
                if (product.url) window.open(product.url, "_blank", "noopener");
            });

            cartBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                onAddToCart(product, currentVariant, cartBtn);
            });

            buyBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                onBuyNow(product, currentVariant);
            });

            return card;
        },

        buildProductRow: function (products, onAddToCart, onBuyNow) {
            var self = this;
            var row = document.createElement("div");
            row.className = "ai-chatbot__product-row";
            products.forEach(function (product) {
                row.appendChild(self.buildProductCard(product, onAddToCart, onBuyNow));
            });

            // Single product: no carousel needed, return the row as-is
            // (preserves prior markup/behavior for the single-product case).
            if (products.length <= 1) return row;

            var wrap = document.createElement("div");
            wrap.className = "ai-chatbot__product-row-wrap";

            var nav = document.createElement("div");
            nav.className = "ai-chatbot__product-row-nav";

            var prevBtn = document.createElement("button");
            prevBtn.type = "button";
            prevBtn.className = "ai-chatbot__product-row-nav-btn";
            prevBtn.setAttribute("aria-label", "Scroll products left");
            prevBtn.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

            var nextBtn = document.createElement("button");
            nextBtn.type = "button";
            nextBtn.className = "ai-chatbot__product-row-nav-btn";
            nextBtn.setAttribute("aria-label", "Scroll products right");
            nextBtn.innerHTML =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

            nav.appendChild(prevBtn);
            nav.appendChild(nextBtn);

            wrap.appendChild(row);
            wrap.appendChild(nav);

            // Scroll by roughly one "page" (visible width) at a time.
            function scrollByPage(direction) {
                var amount = row.clientWidth * 0.9 * direction;
                row.scrollBy({ left: amount, behavior: "smooth" });
            }

            prevBtn.addEventListener("click", function () {
                scrollByPage(-1);
            });
            nextBtn.addEventListener("click", function () {
                scrollByPage(1);
            });

            function updateNavState() {
                var maxScroll = row.scrollWidth - row.clientWidth;
                // No overflow at all: hide the nav entirely instead of two
                // disabled buttons doing nothing.
                if (maxScroll <= 1) {
                    nav.style.display = "none";
                    return;
                }
                nav.style.display = "";
                prevBtn.disabled = row.scrollLeft <= 1;
                nextBtn.disabled = row.scrollLeft >= maxScroll - 1;
            }

            row.addEventListener("scroll", function () {
                window.requestAnimationFrame(updateNavState);
            });

            // Row isn't in the DOM yet when this runs, so defer the initial
            // measurement until after it has been attached and laid out
            // (double rAF to be safe across browsers/insertion timing).
            window.requestAnimationFrame(function () {
                window.requestAnimationFrame(updateNavState);
            });

            window.addEventListener("resize", updateNavState);

            return wrap;
        },

        buildSimpleNotice: function (text) {
            var wrap = document.createElement("div");
            wrap.className = "ai-chatbot__cart-card";

            var notice = document.createElement("div");
            notice.className = "ai-chatbot__cart-card-empty";
            notice.textContent = text;

            wrap.appendChild(notice);
            return wrap;
        },

        // get_cart / create_cart / update_cart / cancel_cart all share this shape.
        buildCartCard: function (cart) {
            var self = this;
            var wrap = document.createElement("div");
            wrap.className = "ai-chatbot__cart-card";

            var lineItems = cart.line_items || [];
            if (lineItems.length === 0) {
                var empty = document.createElement("div");
                empty.className = "ai-chatbot__cart-card-empty";
                empty.textContent = "Your cart is empty.";
                wrap.appendChild(empty);
                return wrap;
            }

            lineItems.forEach(function (line) {
                var row = document.createElement("div");
                row.className = "ai-chatbot__cart-card-line";

                var img = document.createElement("img");
                img.loading = "lazy";
                img.src = (line.item && line.item.image_url) || "";
                img.alt = "";
                row.appendChild(img);

                var info = document.createElement("div");
                info.className = "ai-chatbot__cart-card-line-info";

                var titleEl = document.createElement("div");
                titleEl.className = "ai-chatbot__cart-card-line-title";
                titleEl.textContent = (line.item && line.item.title) || "";

                var metaEl = document.createElement("div");
                metaEl.className = "ai-chatbot__cart-card-line-meta";
                metaEl.textContent =
                    "Qty " +
                    line.quantity +
                    " · " +
                    self.formatMoney(line.item && line.item.price, cart.currency);

                info.appendChild(titleEl);
                info.appendChild(metaEl);
                row.appendChild(info);
                wrap.appendChild(row);
            });

            var footer = document.createElement("div");
            footer.className = "ai-chatbot__cart-card-footer";

            var totalObj = (cart.totals || []).find(function (t) {
                return t.type === "total";
            });
            var totalEl = document.createElement("div");
            totalEl.className = "ai-chatbot__cart-card-total";
            totalEl.textContent = totalObj
                ? self.formatMoney(totalObj.amount, cart.currency)
                : "";
            footer.appendChild(totalEl);

            if (cart.continue_url) {
                var checkoutLink = document.createElement("a");
                checkoutLink.className = "ai-chatbot__cart-card-checkout";
                checkoutLink.href = cart.continue_url;
                checkoutLink.target = "_blank";
                checkoutLink.rel = "noopener";
                checkoutLink.textContent = "Checkout";
                footer.appendChild(checkoutLink);
            }

            wrap.appendChild(footer);
            return wrap;
        },

        // Dispatches a tool_result to the right renderer, or null if the
        // tool has nothing visual to show.
        renderToolResult: function (tool, data, onAddToCart, onBuyNow) {
            if (!data) return null;
            if (tool === "search_catalog" || tool === "lookup_catalog") {
                var products = data.products || [];
                if (!products.length) return null;
                return this.buildProductRow(products, onAddToCart, onBuyNow);
            }
            if (tool === "get_product" && data.product) {
                return this.buildProductRow([data.product], onAddToCart, onBuyNow);
            }
            if (tool === "cancel_cart") {
                // MCP returns the cart's last known state as confirmation, not an
                // emptied cart — don't trust line_items here, it's misleading.
                return this.buildSimpleNotice("Your cart has been cleared.");
            }
            if (
                tool === "get_cart" ||
                tool === "create_cart" ||
                tool === "update_cart"
            ) {
                return this.buildCartCard(data);
            }
            return null;
        },
    };

    /* ------------------------------------------------------------------
     * AIChatbot — main controller
     * ------------------------------------------------------------------ */
    function AIChatbot(root) {
        this.root = root;
        this.launcher = root.querySelector("#ai-chatbot-launcher");
        this.panel = root.querySelector("#ai-chatbot-panel");
        this.closeBtn = root.querySelector("#ai-chatbot-close");
        this.expandBtn = root.querySelector("#ai-chatbot-expand");
        this.clearBtn = root.querySelector("#ai-chatbot-clear");
        this.messagesEl = root.querySelector("#ai-chatbot-messages");
        this.form = root.querySelector("#ai-chatbot-form");
        this.input = root.querySelector("#ai-chatbot-input");
        this.sendBtn = root.querySelector("#ai-chatbot-send");
        this.overlay = root.querySelector("#ai-chatbot-overlay");
        this._starterQuestionsRequestId = 0;

        this.shop = root.dataset.shop || window.location.hostname;
        // this.shop = "shomi-official.myshopify.com";

        var AI_CHATBOT_API_BASE = "/apps/ai-chatbot/api/v1";

        this.apiBase = AI_CHATBOT_API_BASE;
        this.storage = new AIChatbotStorage(this.shop);
        this.api = new AIChatbotAPI(this.apiBase, this.shop);

        this.conversationId = this.storage.getConversationId();
        this.isOpen = root.dataset.startOpen === "true";
        this.isExpanded = false;
        this.isBusy = false;
        this.welcomeMessage = root.dataset.welcomeMessage || "Hi there! How can I help you today?";

        this._bind();
        this._loadHistory();

        if (this.isOpen) {
            this._setOpenState(true, { skipFocus: true });
        }
    }

    AIChatbot.prototype._bind = function () {
        var self = this;

        this.launcher.addEventListener("click", function () {
            self.toggle();
        });
        this.closeBtn.addEventListener("click", function () {
            self.close();
        });
        if (this.expandBtn) {
            this.expandBtn.addEventListener("click", function () {
                self.toggleExpand();
            });
        }
        if (this.overlay) {
            this.overlay.addEventListener("click", function () {
                self.close();
            });
        }
        if (this.clearBtn) {
            this.clearBtn.addEventListener("click", function () {
                self.clearConversation();
            });
        }

        this.form.addEventListener("submit", function (e) {
            e.preventDefault();
            self._handleSend();
        });

        this.input.addEventListener("keydown", function (e) {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                self._handleSend();
            }
        });

        this.input.addEventListener("input", function () {
            self._autoResizeInput();
            self.sendBtn.disabled = self.input.value.trim().length === 0;
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && self.isOpen) {
                self.close();
            }
        });

        document.addEventListener("click", function (e) {
            if (!self.isOpen) return;
            if (self.root.classList.contains("ai-chatbot--drawer")) return;
            if (!self.root.contains(e.target)) {
                self.close();
            }
        });
    };

    /* ---- History loading -------------------------------------------- */
    AIChatbot.prototype._loadHistory = function () {
        var self = this;

        if (!this.conversationId) {
            this._renderWelcome();
            return;
        }

        this.api
            .fetchHistory(this.conversationId)
            .then(function (payload) {
                if (!payload.turns || payload.turns.length === 0) {
                    self._renderWelcome();
                    return;
                }
                payload.turns.forEach(function (turn) {
                    if (turn.role === "user") {
                        self._appendBubble("user", turn.text);
                        return;
                    }
                    self._renderBotTurnFromHistory(turn);
                });
                self._scrollToBottom();
            })
            .catch(function () {
                // History fetch failed (e.g. conversation aged out) — start fresh.
                self.storage.clearConversationId();
                self.conversationId = null;
                self._renderWelcome();
            });
    };

    AIChatbot.prototype._renderWelcome = function () {
        this._loadStarterQuestions();
    };

    AIChatbot.prototype._renderEmptyState = function () {
        var el = document.createElement("div");
        el.className = "ai-chatbot__empty-state";
        el.innerHTML =
            '<h3 class="ai-chatbot__empty-state-title">Start Conversation</h3>' +
            '<span class="ai-chatbot__empty-state-text">Welcome! Type your first message below.</span>';
        this.messagesEl.appendChild(el);
        return el;
    };

    // Removes the "Start Conversation" fallback (and/or the starter
    // questions block, if still present) the moment a real conversation
    // begins — whether the user typed their own message or tapped a
    // starter question. Safe to call any time; no-op if neither exists.
    AIChatbot.prototype._clearWelcomeUI = function () {
        var empty = this.messagesEl.querySelector(".ai-chatbot__empty-state");
        if (empty) empty.remove();
        var starters = this.messagesEl.querySelector(".ai-chatbot__starter-questions");
        if (starters) starters.remove();
    };

    /* ---- Starter questions -------------------------------------------- */
    AIChatbot.prototype._loadStarterQuestions = function () {
        var self = this;
        var requestId = ++this._starterQuestionsRequestId;

        var placeholder = this._renderEmptyState();

        this.api
            .fetchStarterQuestions()
            .then(function (payload) {
                if (requestId !== self._starterQuestionsRequestId) return;
                var questions = (payload && payload.data) || [];
                if (questions.length) {
                    if (placeholder && placeholder.parentNode) placeholder.remove();
                    self._renderStarterQuestions(questions);
                }
            })
            .catch(function () {
                /* no starter questions available — fail silently */
            });
    };

    AIChatbot.prototype._renderStarterQuestions = function (questions) {
        var self = this;

        var wrap = document.createElement("div");
        wrap.className = "ai-chatbot__starter-questions";

        questions.forEach(function (q) {
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ai-chatbot__starter-question";
            btn.textContent = q.question;
            btn.addEventListener("click", function () {
                if (self.isBusy) return;
                wrap.remove();
                self._sendStarterQuestion(q.question);
            });
            wrap.appendChild(btn);
        });

        this.messagesEl.appendChild(wrap);
        this._scrollToBottom();
    };

    AIChatbot.prototype._sendStarterQuestion = function (text) {
        this.input.value = text;
        this._handleSend();
    };

    AIChatbot.prototype._renderBotTurnFromHistory = function (turn) {
        var turnEl = document.createElement("div");
        turnEl.className = "ai-chatbot__turn";

        if (turn.text) {
            var bubble = document.createElement("div");
            bubble.className = "ai-chatbot__message ai-chatbot__message--bot";
            bubble.innerHTML = renderMarkdownLite(turn.text);
            turnEl.appendChild(bubble);
        }

        var self = this;
        var toolResults = this._pickDisplayableToolResults(turn.toolResults || []);
        toolResults.forEach(function (result) {
            var el = ProductRenderer.renderToolResult(
                result.tool,
                result.data,
                self._handleAddToCart.bind(self),
                self._handleBuyNow.bind(self)
            );
            if (el) turnEl.appendChild(el);
        });

        if (turnEl.children.length) this.messagesEl.appendChild(turnEl);
    };

    // Keeps every non-cart tool result, but only the LAST cart-type one
    // (get_cart/create_cart/update_cart/cancel_cart) — that's the only one
    // that reflects the cart's actual final state for this turn.
    AIChatbot.prototype._pickDisplayableToolResults = function (toolResults) {
        var lastCartIndex = -1;
        toolResults.forEach(function (result, i) {
            if (CART_TOOLS.indexOf(result.tool) !== -1) lastCartIndex = i;
        });
        return toolResults.filter(function (result, i) {
            if (CART_TOOLS.indexOf(result.tool) === -1) return true;
            return i === lastCartIndex;
        });
    };

    /* ---- Open/close/expand (unchanged behavior) ---------------------- */
    AIChatbot.prototype.toggle = function () {
        this.isOpen ? this.close() : this.open();
    };
    AIChatbot.prototype.open = function () {
        this._setOpenState(true);
    };
    AIChatbot.prototype.close = function () {
        this._setOpenState(false);
    };
    AIChatbot.prototype._setOpenState = function (open, opts) {
        opts = opts || {};
        this.isOpen = open;
        this.root.classList.toggle("is-open", open);
        this.launcher.setAttribute("aria-expanded", String(open));
        this.panel.setAttribute("aria-hidden", String(!open));

        if (open) {
            document.body.classList.add("ai-chatbot-scroll-lock-mobile");
            if (!opts.skipFocus) {
                var self = this;
                window.requestAnimationFrame(function () {
                    self.input.focus({ preventScroll: true });
                });
            }
            this._scrollToBottom();
        } else {
            document.body.classList.remove("ai-chatbot-scroll-lock-mobile");
            this.launcher.focus({ preventScroll: true });
        }
    };
    AIChatbot.prototype.toggleExpand = function () {
        this.isExpanded = !this.isExpanded;
        this.root.classList.toggle("is-expanded", this.isExpanded);
        if (this.expandBtn) {
            this.expandBtn.setAttribute("aria-pressed", String(this.isExpanded));
            this.expandBtn.setAttribute("aria-label", this.isExpanded ? "Collapse chat" : "Expand chat");
        }
    };

    /* ---- Clear (local only — never touches the DB) -------------------- */
    AIChatbot.prototype.clearConversation = function () {
        if (!this.conversationId && !this.messagesEl.children.length) return;
        this.storage.clearConversationId();
        this.conversationId = null;
        this.messagesEl.innerHTML = "";
        this._renderWelcome();
    };

    AIChatbot.prototype._autoResizeInput = function () {
        this.input.style.height = "auto";
        this.input.style.height = Math.min(this.input.scrollHeight, 120) + "px";
    };

    /* ---- Sending a chat message --------------------------------------- */
    AIChatbot.prototype._appendBubble = function (role, text) {
        var bubble = document.createElement("div");
        bubble.className = "ai-chatbot__message ai-chatbot__message--" + (role === "user" ? "user" : "bot");
        if (role === "user") {
            bubble.textContent = text;
        } else {
            bubble.innerHTML = renderMarkdownLite(text);
        }
        this.messagesEl.appendChild(bubble);
        this._scrollToBottom();
        return bubble;
    };

    AIChatbot.prototype._handleSend = function () {
        var text = this.input.value.trim();
        if (!text || this.isBusy) return;

        // A real conversation is starting now — the "Start Conversation"
        // fallback (and/or any leftover starter-question chips) no longer
        // apply, whether this came from typed input or a starter-question tap.
        this._clearWelcomeUI();

        this._appendBubble("user", text);
        this.input.value = "";
        this._autoResizeInput();
        this.sendBtn.disabled = true;
        this.isBusy = true;

        var self = this;

        // One turn container holds: status -> bot bubble -> tool result cards,
        // regardless of the order events arrive in.
        var turnEl = document.createElement("div");
        turnEl.className = "ai-chatbot__turn";
        this.messagesEl.appendChild(turnEl);

        var statusEl = this._appendStatus(turnEl, "Thinking…");
        var bubbleEl = null;
        var accumulatedText = "";
        var lastCartCardEl = null;

        function ensureBubble() {
            if (statusEl && statusEl.parentNode) {
                statusEl.remove();
                statusEl = null;
            }
            if (!bubbleEl) {
                bubbleEl = document.createElement("div");
                bubbleEl.className = "ai-chatbot__message ai-chatbot__message--bot";
                turnEl.appendChild(bubbleEl);
            }
            return bubbleEl;
        }

        this.api
            .streamChat(text, this.conversationId, {
                onEvent: function (evt) {
                    switch (evt.type) {
                        case "conversation_id":
                            self.conversationId = evt.conversationId;
                            self.storage.setConversationId(evt.conversationId);
                            break;
                        case "tool_use":
                            var name = (evt.tool_use_message || "").replace("Calling tool: ", "");
                            if (statusEl) {
                                statusEl.querySelector(".ai-chatbot__status-text").textContent =
                                    toolStatusText(name);
                            } else {
                                statusEl = self._appendStatus(turnEl, toolStatusText(name));
                            }
                            break;
                        case "chunk":
                            accumulatedText += evt.chunk;
                            ensureBubble().textContent = accumulatedText;
                            self._scrollToBottom();
                            break;
                        case "tool_result":
                            var el = ProductRenderer.renderToolResult(
                                evt.tool,
                                evt.data,
                                self._handleAddToCart.bind(self),
                                self._handleBuyNow.bind(self)
                            );
                            if (el) {
                                if (CART_TOOLS.indexOf(evt.tool) !== -1) {
                                    if (lastCartCardEl && lastCartCardEl.parentNode) {
                                        lastCartCardEl.remove();
                                    }
                                    lastCartCardEl = el;
                                }
                                turnEl.appendChild(el);
                            }
                            self._scrollToBottom();
                            break;
                        case "error":
                            if (statusEl) {
                                statusEl.remove();
                                statusEl = null;
                            }
                            ensureBubble().textContent =
                                accumulatedText || evt.error || "Something went wrong. Please try again.";
                            break;
                        case "end_turn":
                            if (statusEl) {
                                statusEl.remove();
                                statusEl = null;
                            }
                            if (bubbleEl) {
                                bubbleEl.innerHTML = renderMarkdownLite(accumulatedText);
                            }
                            break;
                        default:
                            break;
                    }
                },
            })
            .catch(function () {
                if (statusEl) statusEl.remove();
                ensureBubble().textContent = "Something went wrong. Please try again.";
            })
            .finally(function () {
                self.isBusy = false;
                self.sendBtn.disabled = self.input.value.trim().length === 0;
                self._scrollToBottom();
            });
    };

    AIChatbot.prototype._appendStatus = function (parentEl, text) {
        var status = document.createElement("div");
        status.className = "ai-chatbot__status";
        status.innerHTML =
            '<span class="ai-chatbot__status-spinner" aria-hidden="true"></span>' +
            '<span class="ai-chatbot__status-text"></span>';
        status.querySelector(".ai-chatbot__status-text").textContent = text;
        parentEl.appendChild(status);
        this._scrollToBottom();
        return status;
    };

    /* ---- Direct add-to-cart / buy-now (AI-skipping) -------------------- */
    AIChatbot.prototype._handleAddToCart = function (product, variant, buttonEl) {
        if (!variant) return;
        var self = this;
        if (buttonEl) buttonEl.disabled = true;

        var turnEl = document.createElement("div");
        turnEl.className = "ai-chatbot__turn";
        this.messagesEl.appendChild(turnEl);
        var statusEl = this._appendStatus(turnEl, toolStatusText(this.conversationId ? "update_cart" : "create_cart"));

        this.api
            .addToCart({
                conversationId: this.conversationId,
                variantId: variant.id,
                quantity: 1,
                productTitle: product.title,
                variantTitle: variant.title,
            })
            .then(function (result) {
                if (!self.conversationId) {
                    self.conversationId = result.conversationId;
                    self.storage.setConversationId(result.conversationId);
                }
                statusEl.remove();
                var cartEl = ProductRenderer.buildCartCard(result.data);
                turnEl.appendChild(cartEl);
                self._scrollToBottom();
            })
            .catch(function () {
                statusEl.querySelector(".ai-chatbot__status-text").textContent =
                    "Couldn't add that to your cart — please try again.";
            })
            .finally(function () {
                if (buttonEl) buttonEl.disabled = false;
            });
    };

    AIChatbot.prototype._handleBuyNow = function (product, variant) {
        if (!variant || !variant.checkout_url) return;
        window.open(variant.checkout_url, "_blank", "noopener");
    };

    AIChatbot.prototype._scrollToBottom = function () {
        var el = this.messagesEl;
        window.requestAnimationFrame(function () {
            el.scrollTop = el.scrollHeight;
        });
    };

    /* ------------------------------------------------------------------
     * Bootstrap
     * ------------------------------------------------------------------ */
    function init() {
        var root = document.getElementById("ai-chatbot-root");
        if (!root || root.dataset.aiChatbotInitialized) return;
        root.dataset.aiChatbotInitialized = "true";
        new AIChatbot(root);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();