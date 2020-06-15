;(function () {
	'use strict';

	/**
	 * @preserve FastClick: polyfill to remove click delays on browsers with touch UIs.
	 *
	 * @codingstandard ftlabs-jsv2
	 * @copyright The Financial Times Limited [All Rights Reserved]
	 * @license MIT License (see LICENSE.txt)
	 */

	/*jslint browser:true, node:true*/
	/*global define, Event, Node*/


	/**
	 * Instantiate fast-clicking listeners on the specified layer.
	 *
	 * @constructor
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	function FastClick(layer, options) {
		var oldOnClick;

		options = options || {};

		/**
		 * Whether a click is currently being tracked.
		 *
		 * @type boolean
		 */
		this.trackingClick = false;


		/**
		 * Timestamp for when click tracking started.
		 *
		 * @type number
		 */
		this.trackingClickStart = 0;


		/**
		 * The element being tracked for a click.
		 *
		 * @type EventTarget
		 */
		this.targetElement = null;


		/**
		 * X-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartX = 0;


		/**
		 * Y-coordinate of touch start event.
		 *
		 * @type number
		 */
		this.touchStartY = 0;


		/**
		 * ID of the last touch, retrieved from Touch.identifier.
		 *
		 * @type number
		 */
		this.lastTouchIdentifier = 0;


		/**
		 * Touchmove boundary, beyond which a click will be cancelled.
		 *
		 * @type number
		 */
		this.touchBoundary = options.touchBoundary || 10;


		/**
		 * The FastClick layer.
		 *
		 * @type Element
		 */
		this.layer = layer;

		/**
		 * The minimum time between tap(touchstart and touchend) events
		 *
		 * @type number
		 */
		this.tapDelay = options.tapDelay || 200;

		/**
		 * The maximum time for a tap
		 *
		 * @type number
		 */
		this.tapTimeout = options.tapTimeout || 700;

		if (FastClick.notNeeded(layer)) {
			return;
		}

		// Some old versions of Android don't have Function.prototype.bind
		function bind(method, context) {
			return function() { return method.apply(context, arguments); };
		}


		var methods = ['onMouse', 'onClick', 'onTouchStart', 'onTouchMove', 'onTouchEnd', 'onTouchCancel'];
		var context = this;
		for (var i = 0, l = methods.length; i < l; i++) {
			context[methods[i]] = bind(context[methods[i]], context);
		}

		// Set up event handlers as required
		if (deviceIsAndroid) {
			layer.addEventListener('mouseover', this.onMouse, true);
			layer.addEventListener('mousedown', this.onMouse, true);
			layer.addEventListener('mouseup', this.onMouse, true);
		}

		layer.addEventListener('click', this.onClick, true);
		layer.addEventListener('touchstart', this.onTouchStart, false);
		layer.addEventListener('touchmove', this.onTouchMove, false);
		layer.addEventListener('touchend', this.onTouchEnd, false);
		layer.addEventListener('touchcancel', this.onTouchCancel, false);

		// Hack is required for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
		// which is how FastClick normally stops click events bubbling to callbacks registered on the FastClick
		// layer when they are cancelled.
		if (!Event.prototype.stopImmediatePropagation) {
			layer.removeEventListener = function(type, callback, capture) {
				var rmv = Node.prototype.removeEventListener;
				if (type === 'click') {
					rmv.call(layer, type, callback.hijacked || callback, capture);
				} else {
					rmv.call(layer, type, callback, capture);
				}
			};

			layer.addEventListener = function(type, callback, capture) {
				var adv = Node.prototype.addEventListener;
				if (type === 'click') {
					adv.call(layer, type, callback.hijacked || (callback.hijacked = function(event) {
						if (!event.propagationStopped) {
							callback(event);
						}
					}), capture);
				} else {
					adv.call(layer, type, callback, capture);
				}
			};
		}

		// If a handler is already declared in the element's onclick attribute, it will be fired before
		// FastClick's onClick handler. Fix this by pulling out the user-defined handler function and
		// adding it as listener.
		if (typeof layer.onclick === 'function') {

			// Android browser on at least 3.2 requires a new reference to the function in layer.onclick
			// - the old one won't work if passed to addEventListener directly.
			oldOnClick = layer.onclick;
			layer.addEventListener('click', function(event) {
				oldOnClick(event);
			}, false);
			layer.onclick = null;
		}
	}

	/**
	* Windows Phone 8.1 fakes user agent string to look like Android and iPhone.
	*
	* @type boolean
	*/
	var deviceIsWindowsPhone = navigator.userAgent.indexOf("Windows Phone") >= 0;

	/**
	 * Android requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsAndroid = navigator.userAgent.indexOf('Android') > 0 && !deviceIsWindowsPhone;


	/**
	 * iOS requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsIOS = /iP(ad|hone|od)/.test(navigator.userAgent) && !deviceIsWindowsPhone;


	/**
	 * iOS 4 requires an exception for select elements.
	 *
	 * @type boolean
	 */
	var deviceIsIOS4 = deviceIsIOS && (/OS 4_\d(_\d)?/).test(navigator.userAgent);


	/**
	 * iOS 6.0-7.* requires the target element to be manually derived
	 *
	 * @type boolean
	 */
	var deviceIsIOSWithBadTarget = deviceIsIOS && (/OS [6-7]_\d/).test(navigator.userAgent);

	/**
	 * BlackBerry requires exceptions.
	 *
	 * @type boolean
	 */
	var deviceIsBlackBerry10 = navigator.userAgent.indexOf('BB10') > 0;

	/**
	 * Determine whether a given element requires a native click.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element needs a native click
	 */
	FastClick.prototype.needsClick = function(target) {
		switch (target.nodeName.toLowerCase()) {

		// Don't send a synthetic click to disabled inputs (issue #62)
		case 'button':
		case 'select':
		case 'textarea':
			if (target.disabled) {
				return true;
			}

			break;
		case 'input':

			// File inputs need real clicks on iOS 6 due to a browser bug (issue #68)
			if ((deviceIsIOS && target.type === 'file') || target.disabled) {
				return true;
			}

			break;
		case 'label':
		case 'iframe': // iOS8 homescreen apps can prevent events bubbling into frames
		case 'video':
			return true;
		}

		return (/\bneedsclick\b/).test(target.className);
	};


	/**
	 * Determine whether a given element requires a call to focus to simulate click into element.
	 *
	 * @param {EventTarget|Element} target Target DOM element
	 * @returns {boolean} Returns true if the element requires a call to focus to simulate native click.
	 */
	FastClick.prototype.needsFocus = function(target) {
		switch (target.nodeName.toLowerCase()) {
		case 'textarea':
			return true;
		case 'select':
			return !deviceIsAndroid;
		case 'input':
			switch (target.type) {
			case 'button':
			case 'checkbox':
			case 'file':
			case 'image':
			case 'radio':
			case 'submit':
				return false;
			}

			// No point in attempting to focus disabled inputs
			return !target.disabled && !target.readOnly;
		default:
			return (/\bneedsfocus\b/).test(target.className);
		}
	};


	/**
	 * Send a click event to the specified element.
	 *
	 * @param {EventTarget|Element} targetElement
	 * @param {Event} event
	 */
	FastClick.prototype.sendClick = function(targetElement, event) {
		var clickEvent, touch;

		// On some Android devices activeElement needs to be blurred otherwise the synthetic click will have no effect (#24)
		if (document.activeElement && document.activeElement !== targetElement) {
			document.activeElement.blur();
		}

		touch = event.changedTouches[0];

		// Synthesise a click event, with an extra attribute so it can be tracked
		clickEvent = document.createEvent('MouseEvents');
		clickEvent.initMouseEvent(this.determineEventType(targetElement), true, true, window, 1, touch.screenX, touch.screenY, touch.clientX, touch.clientY, false, false, false, false, 0, null);
		clickEvent.forwardedTouchEvent = true;
		targetElement.dispatchEvent(clickEvent);
	};

	FastClick.prototype.determineEventType = function(targetElement) {

		//Issue #159: Android Chrome Select Box does not open with a synthetic click event
		if (deviceIsAndroid && targetElement.tagName.toLowerCase() === 'select') {
			return 'mousedown';
		}

		return 'click';
	};


	/**
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.focus = function(targetElement) {
		var length;

		// Issue #160: on iOS 7, some input elements (e.g. date datetime month) throw a vague TypeError on setSelectionRange. These elements don't have an integer value for the selectionStart and selectionEnd properties, but unfortunately that can't be used for detection because accessing the properties also throws a TypeError. Just check the type instead. Filed as Apple bug #15122724.
		if (deviceIsIOS && targetElement.setSelectionRange && targetElement.type.indexOf('date') !== 0 && targetElement.type !== 'time' && targetElement.type !== 'month') {
			length = targetElement.value.length;
			targetElement.setSelectionRange(length, length);
		} else {
			targetElement.focus();
		}
	};


	/**
	 * Check whether the given target element is a child of a scrollable layer and if so, set a flag on it.
	 *
	 * @param {EventTarget|Element} targetElement
	 */
	FastClick.prototype.updateScrollParent = function(targetElement) {
		var scrollParent, parentElement;

		scrollParent = targetElement.fastClickScrollParent;

		// Attempt to discover whether the target element is contained within a scrollable layer. Re-check if the
		// target element was moved to another parent.
		if (!scrollParent || !scrollParent.contains(targetElement)) {
			parentElement = targetElement;
			do {
				if (parentElement.scrollHeight > parentElement.offsetHeight) {
					scrollParent = parentElement;
					targetElement.fastClickScrollParent = parentElement;
					break;
				}

				parentElement = parentElement.parentElement;
			} while (parentElement);
		}

		// Always update the scroll top tracker if possible.
		if (scrollParent) {
			scrollParent.fastClickLastScrollTop = scrollParent.scrollTop;
		}
	};


	/**
	 * @param {EventTarget} targetElement
	 * @returns {Element|EventTarget}
	 */
	FastClick.prototype.getTargetElementFromEventTarget = function(eventTarget) {

		// On some older browsers (notably Safari on iOS 4.1 - see issue #56) the event target may be a text node.
		if (eventTarget.nodeType === Node.TEXT_NODE) {
			return eventTarget.parentNode;
		}

		return eventTarget;
	};


	/**
	 * On touch start, record the position and scroll offset.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchStart = function(event) {
		var targetElement, touch, selection;

		// Ignore multiple touches, otherwise pinch-to-zoom is prevented if both fingers are on the FastClick element (issue #111).
		if (event.targetTouches.length > 1) {
			return true;
		}

		targetElement = this.getTargetElementFromEventTarget(event.target);
		touch = event.targetTouches[0];

		if (deviceIsIOS) {

			// Only trusted events will deselect text on iOS (issue #49)
			selection = window.getSelection();
			if (selection.rangeCount && !selection.isCollapsed) {
				return true;
			}

			if (!deviceIsIOS4) {

				// Weird things happen on iOS when an alert or confirm dialog is opened from a click event callback (issue #23):
				// when the user next taps anywhere else on the page, new touchstart and touchend events are dispatched
				// with the same identifier as the touch event that previously triggered the click that triggered the alert.
				// Sadly, there is an issue on iOS 4 that causes some normal touch events to have the same identifier as an
				// immediately preceeding touch event (issue #52), so this fix is unavailable on that platform.
				// Issue 120: touch.identifier is 0 when Chrome dev tools 'Emulate touch events' is set with an iOS device UA string,
				// which causes all touch events to be ignored. As this block only applies to iOS, and iOS identifiers are always long,
				// random integers, it's safe to to continue if the identifier is 0 here.
				if (touch.identifier && touch.identifier === this.lastTouchIdentifier) {
					event.preventDefault();
					return false;
				}

				this.lastTouchIdentifier = touch.identifier;

				// If the target element is a child of a scrollable layer (using -webkit-overflow-scrolling: touch) and:
				// 1) the user does a fling scroll on the scrollable layer
				// 2) the user stops the fling scroll with another tap
				// then the event.target of the last 'touchend' event will be the element that was under the user's finger
				// when the fling scroll was started, causing FastClick to send a click event to that layer - unless a check
				// is made to ensure that a parent layer was not scrolled before sending a synthetic click (issue #42).
				this.updateScrollParent(targetElement);
			}
		}

		this.trackingClick = true;
		this.trackingClickStart = event.timeStamp;
		this.targetElement = targetElement;

		this.touchStartX = touch.pageX;
		this.touchStartY = touch.pageY;

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			event.preventDefault();
		}

		return true;
	};


	/**
	 * Based on a touchmove event object, check whether the touch has moved past a boundary since it started.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.touchHasMoved = function(event) {
		var touch = event.changedTouches[0], boundary = this.touchBoundary;

		if (Math.abs(touch.pageX - this.touchStartX) > boundary || Math.abs(touch.pageY - this.touchStartY) > boundary) {
			return true;
		}

		return false;
	};


	/**
	 * Update the last position.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchMove = function(event) {
		if (!this.trackingClick) {
			return true;
		}

		// If the touch has moved, cancel the click tracking
		if (this.targetElement !== this.getTargetElementFromEventTarget(event.target) || this.touchHasMoved(event)) {
			this.trackingClick = false;
			this.targetElement = null;
		}

		return true;
	};


	/**
	 * Attempt to find the labelled control for the given label element.
	 *
	 * @param {EventTarget|HTMLLabelElement} labelElement
	 * @returns {Element|null}
	 */
	FastClick.prototype.findControl = function(labelElement) {

		// Fast path for newer browsers supporting the HTML5 control attribute
		if (labelElement.control !== undefined) {
			return labelElement.control;
		}

		// All browsers under test that support touch events also support the HTML5 htmlFor attribute
		if (labelElement.htmlFor) {
			return document.getElementById(labelElement.htmlFor);
		}

		// If no for attribute exists, attempt to retrieve the first labellable descendant element
		// the list of which is defined here: http://www.w3.org/TR/html5/forms.html#category-label
		return labelElement.querySelector('button, input:not([type=hidden]), keygen, meter, output, progress, select, textarea');
	};


	/**
	 * On touch end, determine whether to send a click event at once.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onTouchEnd = function(event) {
		var forElement, trackingClickStart, targetTagName, scrollParent, touch, targetElement = this.targetElement;

		if (!this.trackingClick) {
			return true;
		}

		// Prevent phantom clicks on fast double-tap (issue #36)
		if ((event.timeStamp - this.lastClickTime) < this.tapDelay) {
			this.cancelNextClick = true;
			return true;
		}

		if ((event.timeStamp - this.trackingClickStart) > this.tapTimeout) {
			return true;
		}

		// Reset to prevent wrong click cancel on input (issue #156).
		this.cancelNextClick = false;

		this.lastClickTime = event.timeStamp;

		trackingClickStart = this.trackingClickStart;
		this.trackingClick = false;
		this.trackingClickStart = 0;

		// On some iOS devices, the targetElement supplied with the event is invalid if the layer
		// is performing a transition or scroll, and has to be re-detected manually. Note that
		// for this to function correctly, it must be called *after* the event target is checked!
		// See issue #57; also filed as rdar://13048589 .
		if (deviceIsIOSWithBadTarget) {
			touch = event.changedTouches[0];

			// In certain cases arguments of elementFromPoint can be negative, so prevent setting targetElement to null
			targetElement = document.elementFromPoint(touch.pageX - window.pageXOffset, touch.pageY - window.pageYOffset) || targetElement;
			targetElement.fastClickScrollParent = this.targetElement.fastClickScrollParent;
		}

		targetTagName = targetElement.tagName.toLowerCase();
		if (targetTagName === 'label') {
			forElement = this.findControl(targetElement);
			if (forElement) {
				this.focus(targetElement);
				if (deviceIsAndroid) {
					return false;
				}

				targetElement = forElement;
			}
		} else if (this.needsFocus(targetElement)) {

			// Case 1: If the touch started a while ago (best guess is 100ms based on tests for issue #36) then focus will be triggered anyway. Return early and unset the target element reference so that the subsequent click will be allowed through.
			// Case 2: Without this exception for input elements tapped when the document is contained in an iframe, then any inputted text won't be visible even though the value attribute is updated as the user types (issue #37).
			if ((event.timeStamp - trackingClickStart) > 100 || (deviceIsIOS && window.top !== window && targetTagName === 'input')) {
				this.targetElement = null;
				return false;
			}

			this.focus(targetElement);
			this.sendClick(targetElement, event);

			// Select elements need the event to go through on iOS 4, otherwise the selector menu won't open.
			// Also this breaks opening selects when VoiceOver is active on iOS6, iOS7 (and possibly others)
			if (!deviceIsIOS || targetTagName !== 'select') {
				this.targetElement = null;
				event.preventDefault();
			}

			return false;
		}

		if (deviceIsIOS && !deviceIsIOS4) {

			// Don't send a synthetic click event if the target element is contained within a parent layer that was scrolled
			// and this tap is being used to stop the scrolling (usually initiated by a fling - issue #42).
			scrollParent = targetElement.fastClickScrollParent;
			if (scrollParent && scrollParent.fastClickLastScrollTop !== scrollParent.scrollTop) {
				return true;
			}
		}

		// Prevent the actual click from going though - unless the target node is marked as requiring
		// real clicks or if it is in the whitelist in which case only non-programmatic clicks are permitted.
		if (!this.needsClick(targetElement)) {
			event.preventDefault();
			this.sendClick(targetElement, event);
		}

		return false;
	};


	/**
	 * On touch cancel, stop tracking the click.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.onTouchCancel = function() {
		this.trackingClick = false;
		this.targetElement = null;
	};


	/**
	 * Determine mouse events which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onMouse = function(event) {

		// If a target element was never set (because a touch event was never fired) allow the event
		if (!this.targetElement) {
			return true;
		}

		if (event.forwardedTouchEvent) {
			return true;
		}

		// Programmatically generated events targeting a specific element should be permitted
		if (!event.cancelable) {
			return true;
		}

		// Derive and check the target element to see whether the mouse event needs to be permitted;
		// unless explicitly enabled, prevent non-touch click events from triggering actions,
		// to prevent ghost/doubleclicks.
		if (!this.needsClick(this.targetElement) || this.cancelNextClick) {

			// Prevent any user-added listeners declared on FastClick element from being fired.
			if (event.stopImmediatePropagation) {
				event.stopImmediatePropagation();
			} else {

				// Part of the hack for browsers that don't support Event#stopImmediatePropagation (e.g. Android 2)
				event.propagationStopped = true;
			}

			// Cancel the event
			event.stopPropagation();
			event.preventDefault();

			return false;
		}

		// If the mouse event is permitted, return true for the action to go through.
		return true;
	};


	/**
	 * On actual clicks, determine whether this is a touch-generated click, a click action occurring
	 * naturally after a delay after a touch (which needs to be cancelled to avoid duplication), or
	 * an actual click which should be permitted.
	 *
	 * @param {Event} event
	 * @returns {boolean}
	 */
	FastClick.prototype.onClick = function(event) {
		var permitted;

		// It's possible for another FastClick-like library delivered with third-party code to fire a click event before FastClick does (issue #44). In that case, set the click-tracking flag back to false and return early. This will cause onTouchEnd to return early.
		if (this.trackingClick) {
			this.targetElement = null;
			this.trackingClick = false;
			return true;
		}

		// Very odd behaviour on iOS (issue #18): if a submit element is present inside a form and the user hits enter in the iOS simulator or clicks the Go button on the pop-up OS keyboard the a kind of 'fake' click event will be triggered with the submit-type input element as the target.
		if (event.target.type === 'submit' && event.detail === 0) {
			return true;
		}

		permitted = this.onMouse(event);

		// Only unset targetElement if the click is not permitted. This will ensure that the check for !targetElement in onMouse fails and the browser's click doesn't go through.
		if (!permitted) {
			this.targetElement = null;
		}

		// If clicks are permitted, return true for the action to go through.
		return permitted;
	};


	/**
	 * Remove all FastClick's event listeners.
	 *
	 * @returns {void}
	 */
	FastClick.prototype.destroy = function() {
		var layer = this.layer;

		if (deviceIsAndroid) {
			layer.removeEventListener('mouseover', this.onMouse, true);
			layer.removeEventListener('mousedown', this.onMouse, true);
			layer.removeEventListener('mouseup', this.onMouse, true);
		}

		layer.removeEventListener('click', this.onClick, true);
		layer.removeEventListener('touchstart', this.onTouchStart, false);
		layer.removeEventListener('touchmove', this.onTouchMove, false);
		layer.removeEventListener('touchend', this.onTouchEnd, false);
		layer.removeEventListener('touchcancel', this.onTouchCancel, false);
	};


	/**
	 * Check whether FastClick is needed.
	 *
	 * @param {Element} layer The layer to listen on
	 */
	FastClick.notNeeded = function(layer) {
		var metaViewport;
		var chromeVersion;
		var blackberryVersion;
		var firefoxVersion;

		// Devices that don't support touch don't need FastClick
		if (typeof window.ontouchstart === 'undefined') {
			return true;
		}

		// Chrome version - zero for other browsers
		chromeVersion = +(/Chrome\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (chromeVersion) {

			if (deviceIsAndroid) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// Chrome on Android with user-scalable="no" doesn't need FastClick (issue #89)
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// Chrome 32 and above with width=device-width or less don't need FastClick
					if (chromeVersion > 31 && document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}

			// Chrome desktop doesn't need FastClick (issue #15)
			} else {
				return true;
			}
		}

		if (deviceIsBlackBerry10) {
			blackberryVersion = navigator.userAgent.match(/Version\/([0-9]*)\.([0-9]*)/);

			// BlackBerry 10.3+ does not require Fastclick library.
			// https://github.com/ftlabs/fastclick/issues/251
			if (blackberryVersion[1] >= 10 && blackberryVersion[2] >= 3) {
				metaViewport = document.querySelector('meta[name=viewport]');

				if (metaViewport) {
					// user-scalable=no eliminates click delay.
					if (metaViewport.content.indexOf('user-scalable=no') !== -1) {
						return true;
					}
					// width=device-width (or less than device-width) eliminates click delay.
					if (document.documentElement.scrollWidth <= window.outerWidth) {
						return true;
					}
				}
			}
		}

		// IE10 with -ms-touch-action: none or manipulation, which disables double-tap-to-zoom (issue #97)
		if (layer.style.msTouchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		// Firefox version - zero for other browsers
		firefoxVersion = +(/Firefox\/([0-9]+)/.exec(navigator.userAgent) || [,0])[1];

		if (firefoxVersion >= 27) {
			// Firefox 27+ does not have tap delay if the content is not zoomable - https://bugzilla.mozilla.org/show_bug.cgi?id=922896

			metaViewport = document.querySelector('meta[name=viewport]');
			if (metaViewport && (metaViewport.content.indexOf('user-scalable=no') !== -1 || document.documentElement.scrollWidth <= window.outerWidth)) {
				return true;
			}
		}

		// IE11: prefixed -ms-touch-action is no longer supported and it's recomended to use non-prefixed version
		// http://msdn.microsoft.com/en-us/library/windows/apps/Hh767313.aspx
		if (layer.style.touchAction === 'none' || layer.style.touchAction === 'manipulation') {
			return true;
		}

		return false;
	};


	/**
	 * Factory method for creating a FastClick object
	 *
	 * @param {Element} layer The layer to listen on
	 * @param {Object} [options={}] The options to override the defaults
	 */
	FastClick.attach = function(layer, options) {
		return new FastClick(layer, options);
	};


	if (typeof define === 'function' && typeof define.amd === 'object' && define.amd) {

		// AMD. Register as an anonymous module.
		define(function() {
			return FastClick;
		});
	} else if (typeof module !== 'undefined' && module.exports) {
		module.exports = FastClick.attach;
		module.exports.FastClick = FastClick;
	} else {
		window.FastClick = FastClick;
	}
}());

(function() {
  'use strict';
  (function() {
    var Uno, app;
    app = document.body;
    window.Uno = Uno = {
      version: '2.9.0',
      is: function(k, v = true) {
        if (!Array.isArray(v)) {
          return app.dataset[k] === v;
        }
        return v.some(function(v) {
          return app.dataset[k] === v;
        });
      },
      attr: function(k, v) {
        if (v != null) {
          return app.dataset[k] = v;
        } else {
          return app.dataset[k];
        }
      },
      context: function() {
        var className;
        // get the context from the first class name of body
        // https://github.com/TryGhost/Ghost/wiki/Context-aware-Filters-and-Helpers
        className = document.body.className.split(' ')[0].split('-')[0];
        if (className === '') {
          return 'error';
        } else {
          return className;
        }
      },
      linkify: function(selector) {
        return $(selector).each(function() {
          var el, id, text;
          el = $(this);
          text = el.text();
          id = el.attr('id');
          el.html('');
          el.addClass('deep-link');
          return el.append(`<a href=#${id} class=\"title-link\">${text}</a>`);
        });
      },
      search: {
        form: (function() {
          var context;
          context = $('#search-container');
          return function(action) {
            return context[action]();
          };
        })()
      },
      timeAgo: function(selector) {
        return $(selector).each(function() {
          var postDate, postDateInDays;
          postDate = $(this).html();
          postDateInDays = Math.floor((Date.now() - new Date(postDate)) / 86400000);
          if (postDateInDays === 0) {
            postDateInDays = 'today';
          } else if (postDateInDays === 1) {
            postDateInDays = 'yesterday';
          } else {
            postDateInDays = `${postDateInDays} days ago`;
          }
          $(this).html(postDateInDays);
          $(this).mouseover(function() {
            return $(this).html(postDate);
          });
          return $(this).mouseout(function() {
            return $(this).html(postDateInDays);
          });
        });
      },
      device: function() {
        var h, w;
        w = window.innerWidth;
        h = window.innerHeight;
        if (w <= 480) {
          return 'mobile';
        }
        if (w <= 1024) {
          return 'tablet';
        }
        return 'desktop';
      }
    };
    Uno.attr('page', Uno.context());
    Uno.attr('device', Uno.device());
    if (window.profile_title) {
      // window global properties
      $('#profile-title').text(window.profile_title);
    }
    if (window.profile_resume) {
      $('#profile-resume').text(window.profile_resume);
    }
    if (window.posts_headline) {
      $('#posts-headline').text(window.posts_headline);
    }
    return window.open_button = window.open_button || '.nav-posts > a';
  })();

}).call(this);

/* InstantClick 3.1.0 | (C) 2014-2017 Alexandre Dieulot | http://instantclick.io/license */

var instantclick
  , InstantClick = instantclick = function(document, location, $userAgent) {
  // Internal variables
  var $currentLocationWithoutHash
    , $urlToPreload
    , $preloadTimer
    , $lastTouchTimestamp
    , $hasBeenInitialized
    , $touchEndedWithoutClickTimer
    , $lastUsedTimeoutId = 0

  // Preloading-related variables
    , $history = {}
    , $xhr
    , $url = false
    , $title = false
    , $isContentTypeNotHTML
    , $areTrackedElementsDifferent
    , $body = false
    , $lastDisplayTimestamp = 0
    , $isPreloading = false
    , $isWaitingForCompletion = false
    , $gotANetworkError = false
    , $trackedElementsData = []

  // Variables defined by public functions
    , $preloadOnMousedown
    , $delayBeforePreload = 65
    , $eventsCallbacks = {
        preload: [],
        receive: [],
        wait: [],
        change: [],
        restore: [],
        exit: []
      }
    , $timers = {}
    , $currentPageXhrs = []
    , $windowEventListeners = {}
    , $delegatedEvents = {}


  ////////// POLYFILL //////////


  // Needed for `addEvent`
  if (!Element.prototype.matches) {
    Element.prototype.matches =
      Element.prototype.webkitMatchesSelector ||
      Element.prototype.msMatchesSelector ||
      function (selector) {
        var matches = document.querySelectorAll(selector)
        for (var i = 0; i < matches.length; i++) {
          if (matches[i] == this) {
            return true
          }
        }
        return false
      }
  }


  ////////// HELPERS //////////


  function removeHash(url) {
    var index = url.indexOf('#')
    if (index == -1) {
      return url
    }
    return url.substr(0, index)
  }

  function getParentLinkElement(element) {
    while (element && element.nodeName != 'A') {
      element = element.parentNode
    }
    // `element` will be null if no link element is found
    return element
  }

  function isBlacklisted(element) {
    do {
      if (!element.hasAttribute) { // Parent of <html>
        break
      }
      if (element.hasAttribute('data-instant')) {
        return false
      }
      if (element.hasAttribute('data-no-instant')) {
        return true
      }
    }
    while (element = element.parentNode)
    return false
  }

  function isPreloadable(linkElement) {
    var domain = location.protocol + '//' + location.host

    if (linkElement.target // target="_blank" etc.
        || linkElement.hasAttribute('download')
        || linkElement.href.indexOf(domain + '/') != 0 // Another domain, or no href attribute
        || (linkElement.href.indexOf('#') > -1
            && removeHash(linkElement.href) == $currentLocationWithoutHash) // Anchor
        || isBlacklisted(linkElement)
       ) {
      return false
    }
    return true
  }

  function triggerPageEvent(eventType) {
    var argumentsToApply = Array.prototype.slice.call(arguments, 1)
      , returnValue = false
    for (var i = 0; i < $eventsCallbacks[eventType].length; i++) {
      if (eventType == 'receive') {
        var altered = $eventsCallbacks[eventType][i].apply(window, argumentsToApply)
        if (altered) {
          // Update arguments for the next iteration of the loop.
          if ('body' in altered) {
            argumentsToApply[1] = altered.body
          }
          if ('title' in altered) {
            argumentsToApply[2] = altered.title
          }

          returnValue = altered
        }
      }
      else {
        $eventsCallbacks[eventType][i].apply(window, argumentsToApply)
      }
    }
    return returnValue
  }

  function changePage(title, body, urlToPush, scrollPosition) {
    abortCurrentPageXhrs()

    document.documentElement.replaceChild(body, document.body)
    // We cannot just use `document.body = doc.body`, it causes Safari (tested
    // 5.1, 6.0 and Mobile 7.0) to execute script tags directly.

    document.title = title

    if (urlToPush) {
      addOrRemoveWindowEventListeners('remove')
      if (urlToPush != location.href) {
        history.pushState(null, null, urlToPush)

        if ($userAgent.indexOf(' CriOS/') > -1) {
          // Chrome for iOS:
          //
          // 1. Removes title in tab on pushState, so it needs to be set after.
          //
          // 2. Will not set the title if it's identical after trimming, so we
          //    add a non-breaking space.
          if (document.title == title) {
            document.title = title + String.fromCharCode(160)
          }
          else {
            document.title = title
          }
        }
      }

      var hashIndex = urlToPush.indexOf('#')
        , offsetElement = hashIndex > -1
                     && document.getElementById(urlToPush.substr(hashIndex + 1))
        , offset = 0

      if (offsetElement) {
        while (offsetElement.offsetParent) {
          offset += offsetElement.offsetTop

          offsetElement = offsetElement.offsetParent
        }
      }
      if ('requestAnimationFrame' in window) {
        // Safari on macOS doesn't immediately visually change the page on
        // `document.documentElement.replaceChild`, so if `scrollTo` is called
        // without `requestAnimationFrame` it often scrolls before the page
        // is displayed.
        requestAnimationFrame(function() {
          scrollTo(0, offset)
        })
      }
      else {
        scrollTo(0, offset)
        // Safari on macOS scrolls before the page is visually changed, but
        // adding `requestAnimationFrame` doesn't fix it in this case.
      }

      clearCurrentPageTimeouts()

      $currentLocationWithoutHash = removeHash(urlToPush)

      if ($currentLocationWithoutHash in $windowEventListeners) {
        $windowEventListeners[$currentLocationWithoutHash] = []
      }

      $timers[$currentLocationWithoutHash] = {}

      applyScriptElements(function(element) {
        return !element.hasAttribute('data-instant-track')
      })

      triggerPageEvent('change', false)
    }
    else {
      // On popstate, browsers scroll by themselves, but at least Firefox
      // scrolls BEFORE popstate is fired and thus before we can replace the
      // page. If the page before popstate is too short the user won't be
      // scrolled at the right position as a result. We need to scroll again.
      scrollTo(0, scrollPosition)

      // iOS's gesture to go back by swiping from the left edge of the screen
      // will start a preloading if the user touches a link, it needs to be
      // cancelled otherwise the page behind the touched link will be
      // displayed.
      $xhr.abort()
      setPreloadingAsHalted()

      applyScriptElements(function(element) {
        return element.hasAttribute('data-instant-restore')
      })

      restoreTimers()

      triggerPageEvent('restore')
    }
  }

  function setPreloadingAsHalted() {
    $isPreloading = false
    $isWaitingForCompletion = false
  }

  function removeNoscriptTags(html) {
    // Must be done on text, not on a node's innerHTML, otherwise strange
    // things happen with implicitly closed elements (see the Noscript test).
    return html.replace(/<noscript[\s\S]+?<\/noscript>/gi, '')
  }

  function abortCurrentPageXhrs() {
    for (var i = 0; i < $currentPageXhrs.length; i++) {
      if (typeof $currentPageXhrs[i] == 'object' && 'abort' in $currentPageXhrs[i]) {
        $currentPageXhrs[i].instantclickAbort = true
        $currentPageXhrs[i].abort()
      }
    }
    $currentPageXhrs = []
  }

  function clearCurrentPageTimeouts() {
    for (var i in $timers[$currentLocationWithoutHash]) {
      var timeout = $timers[$currentLocationWithoutHash][i]
      window.clearTimeout(timeout.realId)
      timeout.delayLeft = timeout.delay - +new Date + timeout.timestamp
    }
  }

  function restoreTimers() {
    for (var i in $timers[$currentLocationWithoutHash]) {
      if (!('delayLeft' in $timers[$currentLocationWithoutHash][i])) {
        continue
      }
      var args = [
        $timers[$currentLocationWithoutHash][i].callback,
        $timers[$currentLocationWithoutHash][i].delayLeft
      ]
      for (var j = 0; j < $timers[$currentLocationWithoutHash][i].params.length; j++) {
        args.push($timers[$currentLocationWithoutHash][i].params[j])
      }
      addTimer(args, $timers[$currentLocationWithoutHash][i].isRepeating, $timers[$currentLocationWithoutHash][i].delay)
      delete $timers[$currentLocationWithoutHash][i]
    }
  }

  function handleTouchendWithoutClick() {
    $xhr.abort()
    setPreloadingAsHalted()
  }

  function addOrRemoveWindowEventListeners(addOrRemove) {
    if ($currentLocationWithoutHash in $windowEventListeners) {
      for (var i = 0; i < $windowEventListeners[$currentLocationWithoutHash].length; i++) {
        window[addOrRemove + 'EventListener'].apply(window, $windowEventListeners[$currentLocationWithoutHash][i])
      }
    }
  }

  function applyScriptElements(condition) {
    var scriptElementsInDOM = document.body.getElementsByTagName('script')
      , scriptElementsToCopy = []
      , originalElement
      , copyElement
      , parentNode
      , nextSibling
      , i

    // `scriptElementsInDOM` will change during the copy of scripts if
    // a script add or delete script elements, so we need to put script
    // elements in an array to loop through them correctly.
    for (i = 0; i < scriptElementsInDOM.length; i++) {
      scriptElementsToCopy.push(scriptElementsInDOM[i])
    }

    for (i = 0; i < scriptElementsToCopy.length; i++) {
      originalElement = scriptElementsToCopy[i]
      if (!originalElement) { // Might have disappeared, see previous comment
        continue
      }
      if (!condition(originalElement)) {
        continue
      }

      copyElement = document.createElement('script')
      for (var j = 0; j < originalElement.attributes.length; j++) {
        copyElement.setAttribute(originalElement.attributes[j].name, originalElement.attributes[j].value)
      }
      copyElement.textContent = originalElement.textContent

      parentNode = originalElement.parentNode
      nextSibling = originalElement.nextSibling
      parentNode.removeChild(originalElement)
      parentNode.insertBefore(copyElement, nextSibling)
    }
  }

  function addTrackedElements() {
    var trackedElements = document.querySelectorAll('[data-instant-track]')
      , element
      , elementData
    for (var i = 0; i < trackedElements.length; i++) {
      element = trackedElements[i]
      elementData = element.getAttribute('href') || element.getAttribute('src') || element.textContent
      // We can't use just `element.href` and `element.src` because we can't
      // retrieve `href`s and `src`s from the Ajax response.
      $trackedElementsData.push(elementData)
    }
  }

  function addTimer(args, isRepeating, realDelay) {
    var callback = args[0]
      , delay = args[1]
      , params = [].slice.call(args, 2)
      , timestamp = +new Date

    $lastUsedTimeoutId++
    var id = $lastUsedTimeoutId

    var callbackModified
    if (isRepeating) {
      callbackModified = function(args2) {
        callback(args2)
        delete $timers[$currentLocationWithoutHash][id]
        args[0] = callback
        args[1] = delay
        addTimer(args, true)
      }
    }
    else {
      callbackModified = function(args2) {
        callback(args2)
        delete $timers[$currentLocationWithoutHash][id]
      }
    }

    args[0] = callbackModified
    if (realDelay != undefined) {
      timestamp += delay - realDelay
      delay = realDelay
    }
    var realId = window.setTimeout.apply(window, args)
    $timers[$currentLocationWithoutHash][id] = {
      realId: realId,
      timestamp: timestamp,
      callback: callback,
      delay: delay,
      params: params,
      isRepeating: isRepeating
    }
    return -id
  }


  ////////// EVENT LISTENERS //////////


  function mousedownListener(event) {
    var linkElement = getParentLinkElement(event.target)

    if (!linkElement || !isPreloadable(linkElement)) {
      return
    }

    preload(linkElement.href)
  }

  function mouseoverListener(event) {
    if ($lastTouchTimestamp > (+new Date - 500)) {
      // On a touch device, if the content of the page change on mouseover
      // click is never fired and the user will need to tap a second time.
      // https://developer.apple.com/library/content/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html#//apple_ref/doc/uid/TP40006511-SW4
      //
      // Content change could happen in the `preload` event, so we stop there.
      return
    }

    if (+new Date - $lastDisplayTimestamp < 100) {
      // After a page is displayed, if the user's cursor happens to be above
      // a link a mouseover event will be in most browsers triggered
      // automatically, and in other browsers it will be triggered when the
      // user moves his mouse by 1px.
      //
      // Here are the behaviors I noticed, all on Windows:
      // - Safari 5.1: auto-triggers after 0 ms
      // - IE 11: auto-triggers after 30-80 ms (depends on page's size?)
      // - Firefox: auto-triggers after 10 ms
      // - Opera 18: auto-triggers after 10 ms
      //
      // - Chrome: triggers when cursor moved
      // - Opera 12.16: triggers when cursor moved
      //
      // To remedy to this, we do nothing if the last display occurred less
      // than 100 ms ago.

      return
    }

    var linkElement = getParentLinkElement(event.target)

    if (!linkElement) {
      return
    }

    if (linkElement == getParentLinkElement(event.relatedTarget)) {
      // Happens when mouseout-ing and mouseover-ing child elements of the same link element
      return
    }

    if (!isPreloadable(linkElement)) {
      return
    }

    linkElement.addEventListener('mouseout', mouseoutListener)

    if (!$isWaitingForCompletion) {
      $urlToPreload = linkElement.href
      $preloadTimer = setTimeout(preload, $delayBeforePreload)
    }
  }

  function touchstartListener(event) {
    $lastTouchTimestamp = +new Date

    var linkElement = getParentLinkElement(event.target)

    if (!linkElement || !isPreloadable(linkElement)) {
      return
    }

    if ($touchEndedWithoutClickTimer) {
      clearTimeout($touchEndedWithoutClickTimer)
      $touchEndedWithoutClickTimer = false
    }

    linkElement.addEventListener('touchend', touchendAndTouchcancelListener)
    linkElement.addEventListener('touchcancel', touchendAndTouchcancelListener)

    preload(linkElement.href)
  }

  function clickListenerPrelude() {
    // Makes clickListener be fired after everyone else, so that we can respect
    // event.preventDefault.
    document.addEventListener('click', clickListener)
  }

  function clickListener(event) {
    document.removeEventListener('click', clickListener)

    if ($touchEndedWithoutClickTimer) {
      clearTimeout($touchEndedWithoutClickTimer)
      $touchEndedWithoutClickTimer = false
    }

    if (event.defaultPrevented) {
      return
    }

    var linkElement = getParentLinkElement(event.target)

    if (!linkElement || !isPreloadable(linkElement)) {
      return
    }

    // Check if it's opening in a new tab
    if (event.button != 0 // Chrome < 55 fires a click event when the middle mouse button is pressed
      || event.metaKey
      || event.ctrlKey) {
      return
    }
    event.preventDefault()
    display(linkElement.href)
  }

  function mouseoutListener(event) {
    if (getParentLinkElement(event.target) == getParentLinkElement(event.relatedTarget)) {
      // Happens when mouseout-ing and mouseover-ing child elements of the same link element,
      // we don't want to stop preloading then.
      return
    }

    if ($preloadTimer) {
      clearTimeout($preloadTimer)
      $preloadTimer = false
      return
    }

    if (!$isPreloading || $isWaitingForCompletion) {
      return
    }

    $xhr.abort()
    setPreloadingAsHalted()
  }

  function touchendAndTouchcancelListener(event) {
    if (!$isPreloading || $isWaitingForCompletion) {
      return
    }

    $touchEndedWithoutClickTimer = setTimeout(handleTouchendWithoutClick, 500)
  }

  function readystatechangeListener() {
    if ($xhr.readyState == 2) { // headers received
      var contentType = $xhr.getResponseHeader('Content-Type')
      if (!contentType || !/^text\/html/i.test(contentType)) {
        $isContentTypeNotHTML = true
      }
    }

    if ($xhr.readyState < 4) {
      return
    }

    if ($xhr.status == 0) {
      // Request error/timeout/abort
      $gotANetworkError = true
      if ($isWaitingForCompletion) {
        triggerPageEvent('exit', $url, 'network error')
        location.href = $url
      }
      return
    }

    if ($isContentTypeNotHTML) {
      if ($isWaitingForCompletion) {
        triggerPageEvent('exit', $url, 'non-html content-type')
        location.href = $url
      }
      return
    }

    var doc = document.implementation.createHTMLDocument('')
    doc.documentElement.innerHTML = removeNoscriptTags($xhr.responseText)
    $title = doc.title
    $body = doc.body

    var alteredOnReceive = triggerPageEvent('receive', $url, $body, $title)
    if (alteredOnReceive) {
      if ('body' in alteredOnReceive) {
        $body = alteredOnReceive.body
      }
      if ('title' in alteredOnReceive) {
        $title = alteredOnReceive.title
      }
    }

    var urlWithoutHash = removeHash($url)
    $history[urlWithoutHash] = {
      body: $body,
      title: $title,
      scrollPosition: urlWithoutHash in $history ? $history[urlWithoutHash].scrollPosition : 0
    }

    var trackedElements = doc.querySelectorAll('[data-instant-track]')
      , element
      , elementData

    if (trackedElements.length != $trackedElementsData.length) {
      $areTrackedElementsDifferent = true
    }
    else {
      for (var i = 0; i < trackedElements.length; i++) {
        element = trackedElements[i]
        elementData = element.getAttribute('href') || element.getAttribute('src') || element.textContent
        if ($trackedElementsData.indexOf(elementData) == -1) {
          $areTrackedElementsDifferent = true
        }
      }
    }

    if ($isWaitingForCompletion) {
      $isWaitingForCompletion = false
      display($url)
    }
  }

  function popstateListener() {
    var loc = removeHash(location.href)
    if (loc == $currentLocationWithoutHash) {
      return
    }

    if ($isWaitingForCompletion) {
      setPreloadingAsHalted()
      $xhr.abort()
    }

    if (!(loc in $history)) {
      triggerPageEvent('exit', location.href, 'not in history')
      if (loc == location.href) { // no location.hash
        location.href = location.href
        // Reloads the page while using cache for scripts, styles and images,
        // unlike `location.reload()`
      }
      else {
        // When there's a hash, `location.href = location.href` won't reload
        // the page (but will trigger a popstate event, thus causing an infinite
        // loop), so we need to call `location.reload()`
        location.reload()
      }
      return
    }

    $history[$currentLocationWithoutHash].scrollPosition = pageYOffset
    clearCurrentPageTimeouts()
    addOrRemoveWindowEventListeners('remove')
    $currentLocationWithoutHash = loc
    changePage($history[loc].title, $history[loc].body, false, $history[loc].scrollPosition)
    addOrRemoveWindowEventListeners('add')
  }


  ////////// MAIN FUNCTIONS //////////


  function preload(url) {
    if ($preloadTimer) {
      clearTimeout($preloadTimer)
      $preloadTimer = false
    }

    if (!url) {
      url = $urlToPreload
    }

    if ($isPreloading && (url == $url || $isWaitingForCompletion)) {
      return
    }
    $isPreloading = true
    $isWaitingForCompletion = false

    $url = url
    $body = false
    $isContentTypeNotHTML = false
    $gotANetworkError = false
    $areTrackedElementsDifferent = false
    triggerPageEvent('preload')
    $xhr.open('GET', url)
    $xhr.timeout = 90000 // Must be set after `open()` with IE
    $xhr.send()
  }

  function display(url) {
    $lastDisplayTimestamp = +new Date
    if ($preloadTimer || !$isPreloading) {
      // $preloadTimer:
      // Happens when there's a delay before preloading and that delay
      // hasn't expired (preloading didn't kick in).
      //
      // !$isPreloading:
      // A link has been clicked, and preloading hasn't been initiated.
      // It happens with touch devices when a user taps *near* the link,
      // causing `touchstart` not to be fired. Safari/Chrome will trigger
      // `mouseover`, `mousedown`, `click` (and others), but when that happens
      // we do nothing in `mouseover` as it may cause `click` not to fire (see
      // comment in `mouseoverListener`).
      //
      // It also happens when a user uses his keyboard to navigate (with Tab
      // and Return), and possibly in other non-mainstream ways to navigate
      // a website.

      if ($preloadTimer && $url && $url != url) {
        // Happens when the user clicks on a link before preloading
        // kicks in while another link is already preloading.

        triggerPageEvent('exit', url, 'click occured while preloading planned')
        location.href = url
        return
      }

      preload(url)
      triggerPageEvent('wait')
      $isWaitingForCompletion = true // Must be set *after* calling `preload`
      return
    }
    if ($isWaitingForCompletion) {
      // The user clicked on a link while a page to display was preloading.
      // Either on the same link or on another link. If it's the same link
      // something might have gone wrong (or he could have double clicked, we
      // don't handle that case), so we send him to the page without pjax.
      // If it's another link, it hasn't been preloaded, so we redirect the
      // user to it.
      triggerPageEvent('exit', url, 'clicked on a link while waiting for another page to display')
      location.href = url
      return
    }
    if ($isContentTypeNotHTML) {
      triggerPageEvent('exit', $url, 'non-html content-type')
      location.href = $url
      return
    }
    if ($gotANetworkError) {
      triggerPageEvent('exit', $url, 'network error')
      location.href = $url
      return
    }
    if ($areTrackedElementsDifferent) {
      triggerPageEvent('exit', $url, 'different assets')
      location.href = $url
      return
    }
    if (!$body) {
      triggerPageEvent('wait')
      $isWaitingForCompletion = true
      return
    }
    $history[$currentLocationWithoutHash].scrollPosition = pageYOffset
    setPreloadingAsHalted()
    changePage($title, $body, $url)
  }


  ////////// PUBLIC VARIABLE AND FUNCTIONS //////////


  var supported = false
  if ('pushState' in history
      && location.protocol != "file:") {
    supported = true

    var indexOfAndroid = $userAgent.indexOf('Android ')
    if (indexOfAndroid > -1) {
      // The stock browser in Android 4.0.3 through 4.3.1 supports pushState,
      // though it doesn't update the address bar.
      //
      // More problematic is that it has a bug on `popstate` when coming back
      // from a page not displayed through InstantClick: `location.href` is
      // undefined and `location.reload()` doesn't work.
      //
      // Android < 4.4 is therefore blacklisted, unless it's a browser known
      // not to have that latter bug.

      var androidVersion = parseFloat($userAgent.substr(indexOfAndroid + 'Android '.length))
      if (androidVersion < 4.4) {
        supported = false
        if (androidVersion >= 4) {
          var whitelistedBrowsersUserAgentsOnAndroid4 = [
            / Chrome\//, // Chrome, Opera, Puffin, QQ, Yandex
            / UCBrowser\//,
            / Firefox\//,
            / Windows Phone /, // WP 8.1+ pretends to be Android
          ]
          for (var i = 0; i < whitelistedBrowsersUserAgentsOnAndroid4.length; i++) {
            if (whitelistedBrowsersUserAgentsOnAndroid4[i].test($userAgent)) {
              supported = true
              break
            }
          }
        }
      }
    }
  }

  function init(preloadingMode) {
    if (!supported) {
      triggerPageEvent('change', true)
      return
    }

    if ($hasBeenInitialized) {
      return
    }
    $hasBeenInitialized = true

    if (preloadingMode == 'mousedown') {
      $preloadOnMousedown = true
    }
    else if (typeof preloadingMode == 'number') {
      $delayBeforePreload = preloadingMode
    }

    $currentLocationWithoutHash = removeHash(location.href)
    $timers[$currentLocationWithoutHash] = {}
    $history[$currentLocationWithoutHash] = {
      body: document.body,
      title: document.title,
      scrollPosition: pageYOffset
    }

    if (document.readyState == 'loading') {
      document.addEventListener('DOMContentLoaded', addTrackedElements)
    }
    else {
      addTrackedElements()
    }

    $xhr = new XMLHttpRequest()
    $xhr.addEventListener('readystatechange', readystatechangeListener)

    document.addEventListener('touchstart', touchstartListener, true)
    if ($preloadOnMousedown) {
      document.addEventListener('mousedown', mousedownListener, true)
    }
    else {
      document.addEventListener('mouseover', mouseoverListener, true)
    }
    document.addEventListener('click', clickListenerPrelude, true)

    addEventListener('popstate', popstateListener)
  }

  function on(eventType, callback) {
    $eventsCallbacks[eventType].push(callback)

    if (eventType == 'change') {
      callback(!$lastDisplayTimestamp)
    }
  }

  function setTimeout() {
    return addTimer(arguments, false)
  }

  function setInterval() {
    return addTimer(arguments, true)
  }

  function clearTimeout(id) {
    id = -id
    for (var loc in $timers) {
      if (id in $timers[loc]) {
        window.clearTimeout($timers[loc][id].realId)
        delete $timers[loc][id]
      }
    }
  }

  function xhr(xhr) {
    $currentPageXhrs.push(xhr)
  }

  function addPageEvent() {
    if (!($currentLocationWithoutHash in $windowEventListeners)) {
      $windowEventListeners[$currentLocationWithoutHash] = []
    }
    $windowEventListeners[$currentLocationWithoutHash].push(arguments)
    addEventListener.apply(window, arguments)
  }

  function removePageEvent() {
    if (!($currentLocationWithoutHash in $windowEventListeners)) {
      return
    }
    firstLoop:
    for (var i = 0; i < $windowEventListeners[$currentLocationWithoutHash].length; i++) {
      if (arguments.length != $windowEventListeners[$currentLocationWithoutHash][i].length) {
        continue
      }
      for (var j = 0; j < $windowEventListeners[$currentLocationWithoutHash][i].length; j++) {
        if (arguments[j] != $windowEventListeners[$currentLocationWithoutHash][i][j]) {
          continue firstLoop
        }
      }
      $windowEventListeners[$currentLocationWithoutHash].splice(i, 1)
    }
  }

  function addEvent(selector, type, listener) {
    if (!(type in $delegatedEvents)) {
      $delegatedEvents[type] = {}

      document.addEventListener(type, function(event) {
        var element = event.target
        event.originalStopPropagation = event.stopPropagation
        event.stopPropagation = function() {
          this.isPropagationStopped = true
          this.originalStopPropagation()
        }
        while (element && element.nodeType == 1) {
          for (var selector in $delegatedEvents[type]) {
            if (element.matches(selector)) {
              for (var i = 0; i < $delegatedEvents[type][selector].length; i++) {
                $delegatedEvents[type][selector][i].call(element, event)
              }
              if (event.isPropagationStopped) {
                return
              }
              break
            }
          }
          element = element.parentNode
        }
      }, false) // Third parameter isn't optional in Firefox < 6

      if (type == 'click' && /iP(?:hone|ad|od)/.test($userAgent)) {
        // Force Mobile Safari to trigger the click event on document by adding a pointer cursor to body

        var styleElement = document.createElement('style')
        styleElement.setAttribute('instantclick-mobile-safari-cursor', '') // So that this style element doesn't surprise developers in the browser DOM inspector.
        styleElement.textContent = 'body { cursor: pointer !important; }'
        document.head.appendChild(styleElement)
      }
    }

    if (!(selector in $delegatedEvents[type])) {
      $delegatedEvents[type][selector] = []
    }

    // Run removeEvent beforehand so that it can't be added twice
    removeEvent(selector, type, listener)

    $delegatedEvents[type][selector].push(listener)
  }

  function removeEvent(selector, type, listener) {
    var index = $delegatedEvents[type][selector].indexOf(listener)
    if (index > -1) {
      $delegatedEvents[type][selector].splice(index, 1)
    }
  }


  ////////////////////


  return {
    supported: supported,
    init: init,
    on: on,
    setTimeout: setTimeout,
    setInterval: setInterval,
    clearTimeout: clearTimeout,
    xhr: xhr,
    addPageEvent: addPageEvent,
    removePageEvent: removePageEvent,
    addEvent: addEvent,
    removeEvent: removeEvent
  }

}(document, location, navigator.userAgent);

(function() {
  'use strict';
  $(function() {
    InstantClick.init();
    if (Uno.is('device', 'desktop')) {
      $('a').not('[href*="mailto:"]').click(function() {
        if (this.href.indexOf(location.hostname) === -1) {
          window.open($(this).attr('href'));
          return false;
        }
      });
    } else {
      FastClick.attach(Uno.app);
    }
    if (Uno.is('page', 'home') || Uno.is('page', 'paged') || Uno.is('page', 'tag')) {
      Uno.timeAgo('#posts-list time');
    }
    if (Uno.is('page', 'post')) {
      Uno.timeAgo('.post.meta > time');
      $('main').readingTime({
        readingTimeTarget: '.post.reading-time > span'
      });
      Uno.linkify($('#post-content').children('h1, h2, h3, h4, h5, h6'));
      $('.content').fitVids();
    }
    if (Uno.is('page', 'error')) {
      $('#panic-button').click(function() {
        var s;
        s = document.createElement('script');
        s.setAttribute('src', 'https://nthitz.github.io/turndownforwhatjs/tdfw.js');
        return document.body.appendChild(s);
      });
    }
    return $('#search-input').keyup(function(e) {
      return $('#search-form').attr('action', Uno.search.url + '+' + encodeURIComponent(e.target.value));
    });
  });

}).call(this);

/* InstantClick's loading indicator | (C) 2014-2017 Alexandre Dieulot | http://instantclick.io/license */

;(function() {
  var $element
    , $timer

  function init() {
    $element = document.createElement('div')
    $element.id = 'instantclick'

    var vendors = {
          Webkit: true,
          Moz: true
        }
      , vendorPrefix = ''

    if (!('transform' in $element.style)) {
      for (var vendor in vendors) {
        if (vendor + 'Transform' in $element.style) {
          vendorPrefix = '-' + vendor.toLowerCase() + '-'
        }
      }
    }

    var styleElement = document.createElement('style')
    styleElement.setAttribute('instantclick-loading-indicator', '') // So that this style element doesn't surprise developers in the browser DOM inspector.
    styleElement.textContent = '#instantclick {pointer-events:none; z-index:2147483647; position:fixed; top:0; left:0; width:100%; height:3px; border-radius:2px; color:hsl(192,100%,50%); background:currentColor; box-shadow: 0 -1px 8px; opacity: 0;}' +
                               '#instantclick.visible {opacity:1; ' + vendorPrefix + 'animation:instantclick .6s linear infinite;}' +
                               '@' + vendorPrefix + 'keyframes instantclick {0%,5% {' + vendorPrefix + 'transform:translateX(-100%);} 45%,55% {' + vendorPrefix + 'transform:translateX(0%);} 95%,100% {' + vendorPrefix + 'transform:translateX(100%);}}'
    document.head.appendChild(styleElement)
  }

  function changeListener(isInitialPage) {
    if (!instantclick.supported) {
      return
    }

    if (isInitialPage) {
      init()
    }

    document.body.appendChild($element)

    if (!isInitialPage) {
      hide()
    }
  }

  function restoreListener() {
    document.body.appendChild($element)

    hide()
  }

  function waitListener() {
    $timer = instantclick.setTimeout(show, 800)
  }

  function show() {
    $element.className = 'visible'
  }

  function hide() {
    instantclick.clearTimeout($timer)

    $element.className = ''
    // Doesn't work (has no visible effect) in Safari on `exit`.
    //
    // My guess is that Safari queues styling change for the next frame and
    // drops that queue on location change.
  }


  ////////////////////


  instantclick.on('change', changeListener)
  instantclick.on('restore', restoreListener)
  instantclick.on('wait', waitListener)
  instantclick.on('exit', hide)


  ////////////////////


  instantclick.loadingIndicator = {
    show: show,
    hide: hide
  }
})();

(function() {
  'use strict';
  $(function() {
    var _animate, _expand;
    _animate = function() {
      return setTimeout(function() {
        return $('.cover').addClass('animated');
      }, 1000);
    };
    _expand = function(options) {
      $('main, .cover, .links > li, html').toggleClass('expanded');
      return Uno.search.form(options.form);
    };
    $('#menu-button').click(function() {
      return $('.cover, main, #menu-button, html').toggleClass('expanded');
    });
    $(`${window.open_button}, .aside-link`).click(function(event) {
      if ((Uno.is('page', 'home')) && (($('main, .cover, .links > li, html').hasClass('expanded')) || $(this).is('#avatar-link'))) {
        event.preventDefault();
        location.hash = location.hash === '' ? '#open' : '';
        if (!Uno.is('device', 'desktop')) {
          return $('#menu-button').trigger('click');
        }
        return _expand({
          form: 'toggle'
        });
      }
    });
    if ((Uno.is('device', 'desktop')) && (Uno.is('page', 'home'))) {
      _animate();
      if (location.hash !== '#open') {
        return _expand({
          form: 'hide'
        });
      }
    }
  });

}).call(this);

/*! pace 1.0.2 */
(function(){var a,b,c,d,e,f,g,h,i,j,k,l,m,n,o,p,q,r,s,t,u,v,w,x,y,z,A,B,C,D,E,F,G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U,V,W,X=[].slice,Y={}.hasOwnProperty,Z=function(a,b){function c(){this.constructor=a}for(var d in b)Y.call(b,d)&&(a[d]=b[d]);return c.prototype=b.prototype,a.prototype=new c,a.__super__=b.prototype,a},$=[].indexOf||function(a){for(var b=0,c=this.length;c>b;b++)if(b in this&&this[b]===a)return b;return-1};for(u={catchupTime:100,initialRate:.03,minTime:250,ghostTime:100,maxProgressPerFrame:20,easeFactor:1.25,startOnPageLoad:!0,restartOnPushState:!0,restartOnRequestAfter:500,target:"body",elements:{checkInterval:100,selectors:["body"]},eventLag:{minSamples:10,sampleCount:3,lagThreshold:3},ajax:{trackMethods:["GET"],trackWebSockets:!0,ignoreURLs:[]}},C=function(){var a;return null!=(a="undefined"!=typeof performance&&null!==performance&&"function"==typeof performance.now?performance.now():void 0)?a:+new Date},E=window.requestAnimationFrame||window.mozRequestAnimationFrame||window.webkitRequestAnimationFrame||window.msRequestAnimationFrame,t=window.cancelAnimationFrame||window.mozCancelAnimationFrame,null==E&&(E=function(a){return setTimeout(a,50)},t=function(a){return clearTimeout(a)}),G=function(a){var b,c;return b=C(),(c=function(){var d;return d=C()-b,d>=33?(b=C(),a(d,function(){return E(c)})):setTimeout(c,33-d)})()},F=function(){var a,b,c;return c=arguments[0],b=arguments[1],a=3<=arguments.length?X.call(arguments,2):[],"function"==typeof c[b]?c[b].apply(c,a):c[b]},v=function(){var a,b,c,d,e,f,g;for(b=arguments[0],d=2<=arguments.length?X.call(arguments,1):[],f=0,g=d.length;g>f;f++)if(c=d[f])for(a in c)Y.call(c,a)&&(e=c[a],null!=b[a]&&"object"==typeof b[a]&&null!=e&&"object"==typeof e?v(b[a],e):b[a]=e);return b},q=function(a){var b,c,d,e,f;for(c=b=0,e=0,f=a.length;f>e;e++)d=a[e],c+=Math.abs(d),b++;return c/b},x=function(a,b){var c,d,e;if(null==a&&(a="options"),null==b&&(b=!0),e=document.querySelector("[data-pace-"+a+"]")){if(c=e.getAttribute("data-pace-"+a),!b)return c;try{return JSON.parse(c)}catch(f){return d=f,"undefined"!=typeof console&&null!==console?console.error("Error parsing inline pace options",d):void 0}}},g=function(){function a(){}return a.prototype.on=function(a,b,c,d){var e;return null==d&&(d=!1),null==this.bindings&&(this.bindings={}),null==(e=this.bindings)[a]&&(e[a]=[]),this.bindings[a].push({handler:b,ctx:c,once:d})},a.prototype.once=function(a,b,c){return this.on(a,b,c,!0)},a.prototype.off=function(a,b){var c,d,e;if(null!=(null!=(d=this.bindings)?d[a]:void 0)){if(null==b)return delete this.bindings[a];for(c=0,e=[];c<this.bindings[a].length;)e.push(this.bindings[a][c].handler===b?this.bindings[a].splice(c,1):c++);return e}},a.prototype.trigger=function(){var a,b,c,d,e,f,g,h,i;if(c=arguments[0],a=2<=arguments.length?X.call(arguments,1):[],null!=(g=this.bindings)?g[c]:void 0){for(e=0,i=[];e<this.bindings[c].length;)h=this.bindings[c][e],d=h.handler,b=h.ctx,f=h.once,d.apply(null!=b?b:this,a),i.push(f?this.bindings[c].splice(e,1):e++);return i}},a}(),j=window.Pace||{},window.Pace=j,v(j,g.prototype),D=j.options=v({},u,window.paceOptions,x()),U=["ajax","document","eventLag","elements"],Q=0,S=U.length;S>Q;Q++)K=U[Q],D[K]===!0&&(D[K]=u[K]);i=function(a){function b(){return V=b.__super__.constructor.apply(this,arguments)}return Z(b,a),b}(Error),b=function(){function a(){this.progress=0}return a.prototype.getElement=function(){var a;if(null==this.el){if(a=document.querySelector(D.target),!a)throw new i;this.el=document.createElement("div"),this.el.className="pace pace-active",document.body.className=document.body.className.replace(/pace-done/g,""),document.body.className+=" pace-running",this.el.innerHTML='<div class="pace-progress">\n  <div class="pace-progress-inner"></div>\n</div>\n<div class="pace-activity"></div>',null!=a.firstChild?a.insertBefore(this.el,a.firstChild):a.appendChild(this.el)}return this.el},a.prototype.finish=function(){var a;return a=this.getElement(),a.className=a.className.replace("pace-active",""),a.className+=" pace-inactive",document.body.className=document.body.className.replace("pace-running",""),document.body.className+=" pace-done"},a.prototype.update=function(a){return this.progress=a,this.render()},a.prototype.destroy=function(){try{this.getElement().parentNode.removeChild(this.getElement())}catch(a){i=a}return this.el=void 0},a.prototype.render=function(){var a,b,c,d,e,f,g;if(null==document.querySelector(D.target))return!1;for(a=this.getElement(),d="translate3d("+this.progress+"%, 0, 0)",g=["webkitTransform","msTransform","transform"],e=0,f=g.length;f>e;e++)b=g[e],a.children[0].style[b]=d;return(!this.lastRenderedProgress||this.lastRenderedProgress|0!==this.progress|0)&&(a.children[0].setAttribute("data-progress-text",""+(0|this.progress)+"%"),this.progress>=100?c="99":(c=this.progress<10?"0":"",c+=0|this.progress),a.children[0].setAttribute("data-progress",""+c)),this.lastRenderedProgress=this.progress},a.prototype.done=function(){return this.progress>=100},a}(),h=function(){function a(){this.bindings={}}return a.prototype.trigger=function(a,b){var c,d,e,f,g;if(null!=this.bindings[a]){for(f=this.bindings[a],g=[],d=0,e=f.length;e>d;d++)c=f[d],g.push(c.call(this,b));return g}},a.prototype.on=function(a,b){var c;return null==(c=this.bindings)[a]&&(c[a]=[]),this.bindings[a].push(b)},a}(),P=window.XMLHttpRequest,O=window.XDomainRequest,N=window.WebSocket,w=function(a,b){var c,d,e;e=[];for(d in b.prototype)try{e.push(null==a[d]&&"function"!=typeof b[d]?"function"==typeof Object.defineProperty?Object.defineProperty(a,d,{get:function(){return b.prototype[d]},configurable:!0,enumerable:!0}):a[d]=b.prototype[d]:void 0)}catch(f){c=f}return e},A=[],j.ignore=function(){var a,b,c;return b=arguments[0],a=2<=arguments.length?X.call(arguments,1):[],A.unshift("ignore"),c=b.apply(null,a),A.shift(),c},j.track=function(){var a,b,c;return b=arguments[0],a=2<=arguments.length?X.call(arguments,1):[],A.unshift("track"),c=b.apply(null,a),A.shift(),c},J=function(a){var b;if(null==a&&(a="GET"),"track"===A[0])return"force";if(!A.length&&D.ajax){if("socket"===a&&D.ajax.trackWebSockets)return!0;if(b=a.toUpperCase(),$.call(D.ajax.trackMethods,b)>=0)return!0}return!1},k=function(a){function b(){var a,c=this;b.__super__.constructor.apply(this,arguments),a=function(a){var b;return b=a.open,a.open=function(d,e){return J(d)&&c.trigger("request",{type:d,url:e,request:a}),b.apply(a,arguments)}},window.XMLHttpRequest=function(b){var c;return c=new P(b),a(c),c};try{w(window.XMLHttpRequest,P)}catch(d){}if(null!=O){window.XDomainRequest=function(){var b;return b=new O,a(b),b};try{w(window.XDomainRequest,O)}catch(d){}}if(null!=N&&D.ajax.trackWebSockets){window.WebSocket=function(a,b){var d;return d=null!=b?new N(a,b):new N(a),J("socket")&&c.trigger("request",{type:"socket",url:a,protocols:b,request:d}),d};try{w(window.WebSocket,N)}catch(d){}}}return Z(b,a),b}(h),R=null,y=function(){return null==R&&(R=new k),R},I=function(a){var b,c,d,e;for(e=D.ajax.ignoreURLs,c=0,d=e.length;d>c;c++)if(b=e[c],"string"==typeof b){if(-1!==a.indexOf(b))return!0}else if(b.test(a))return!0;return!1},y().on("request",function(b){var c,d,e,f,g;return f=b.type,e=b.request,g=b.url,I(g)?void 0:j.running||D.restartOnRequestAfter===!1&&"force"!==J(f)?void 0:(d=arguments,c=D.restartOnRequestAfter||0,"boolean"==typeof c&&(c=0),setTimeout(function(){var b,c,g,h,i,k;if(b="socket"===f?e.readyState<2:0<(h=e.readyState)&&4>h){for(j.restart(),i=j.sources,k=[],c=0,g=i.length;g>c;c++){if(K=i[c],K instanceof a){K.watch.apply(K,d);break}k.push(void 0)}return k}},c))}),a=function(){function a(){var a=this;this.elements=[],y().on("request",function(){return a.watch.apply(a,arguments)})}return a.prototype.watch=function(a){var b,c,d,e;return d=a.type,b=a.request,e=a.url,I(e)?void 0:(c="socket"===d?new n(b):new o(b),this.elements.push(c))},a}(),o=function(){function a(a){var b,c,d,e,f,g,h=this;if(this.progress=0,null!=window.ProgressEvent)for(c=null,a.addEventListener("progress",function(a){return h.progress=a.lengthComputable?100*a.loaded/a.total:h.progress+(100-h.progress)/2},!1),g=["load","abort","timeout","error"],d=0,e=g.length;e>d;d++)b=g[d],a.addEventListener(b,function(){return h.progress=100},!1);else f=a.onreadystatechange,a.onreadystatechange=function(){var b;return 0===(b=a.readyState)||4===b?h.progress=100:3===a.readyState&&(h.progress=50),"function"==typeof f?f.apply(null,arguments):void 0}}return a}(),n=function(){function a(a){var b,c,d,e,f=this;for(this.progress=0,e=["error","open"],c=0,d=e.length;d>c;c++)b=e[c],a.addEventListener(b,function(){return f.progress=100},!1)}return a}(),d=function(){function a(a){var b,c,d,f;for(null==a&&(a={}),this.elements=[],null==a.selectors&&(a.selectors=[]),f=a.selectors,c=0,d=f.length;d>c;c++)b=f[c],this.elements.push(new e(b))}return a}(),e=function(){function a(a){this.selector=a,this.progress=0,this.check()}return a.prototype.check=function(){var a=this;return document.querySelector(this.selector)?this.done():setTimeout(function(){return a.check()},D.elements.checkInterval)},a.prototype.done=function(){return this.progress=100},a}(),c=function(){function a(){var a,b,c=this;this.progress=null!=(b=this.states[document.readyState])?b:100,a=document.onreadystatechange,document.onreadystatechange=function(){return null!=c.states[document.readyState]&&(c.progress=c.states[document.readyState]),"function"==typeof a?a.apply(null,arguments):void 0}}return a.prototype.states={loading:0,interactive:50,complete:100},a}(),f=function(){function a(){var a,b,c,d,e,f=this;this.progress=0,a=0,e=[],d=0,c=C(),b=setInterval(function(){var g;return g=C()-c-50,c=C(),e.push(g),e.length>D.eventLag.sampleCount&&e.shift(),a=q(e),++d>=D.eventLag.minSamples&&a<D.eventLag.lagThreshold?(f.progress=100,clearInterval(b)):f.progress=100*(3/(a+3))},50)}return a}(),m=function(){function a(a){this.source=a,this.last=this.sinceLastUpdate=0,this.rate=D.initialRate,this.catchup=0,this.progress=this.lastProgress=0,null!=this.source&&(this.progress=F(this.source,"progress"))}return a.prototype.tick=function(a,b){var c;return null==b&&(b=F(this.source,"progress")),b>=100&&(this.done=!0),b===this.last?this.sinceLastUpdate+=a:(this.sinceLastUpdate&&(this.rate=(b-this.last)/this.sinceLastUpdate),this.catchup=(b-this.progress)/D.catchupTime,this.sinceLastUpdate=0,this.last=b),b>this.progress&&(this.progress+=this.catchup*a),c=1-Math.pow(this.progress/100,D.easeFactor),this.progress+=c*this.rate*a,this.progress=Math.min(this.lastProgress+D.maxProgressPerFrame,this.progress),this.progress=Math.max(0,this.progress),this.progress=Math.min(100,this.progress),this.lastProgress=this.progress,this.progress},a}(),L=null,H=null,r=null,M=null,p=null,s=null,j.running=!1,z=function(){return D.restartOnPushState?j.restart():void 0},null!=window.history.pushState&&(T=window.history.pushState,window.history.pushState=function(){return z(),T.apply(window.history,arguments)}),null!=window.history.replaceState&&(W=window.history.replaceState,window.history.replaceState=function(){return z(),W.apply(window.history,arguments)}),l={ajax:a,elements:d,document:c,eventLag:f},(B=function(){var a,c,d,e,f,g,h,i;for(j.sources=L=[],g=["ajax","elements","document","eventLag"],c=0,e=g.length;e>c;c++)a=g[c],D[a]!==!1&&L.push(new l[a](D[a]));for(i=null!=(h=D.extraSources)?h:[],d=0,f=i.length;f>d;d++)K=i[d],L.push(new K(D));return j.bar=r=new b,H=[],M=new m})(),j.stop=function(){return j.trigger("stop"),j.running=!1,r.destroy(),s=!0,null!=p&&("function"==typeof t&&t(p),p=null),B()},j.restart=function(){return j.trigger("restart"),j.stop(),j.start()},j.go=function(){var a;return j.running=!0,r.render(),a=C(),s=!1,p=G(function(b,c){var d,e,f,g,h,i,k,l,n,o,p,q,t,u,v,w;for(l=100-r.progress,e=p=0,f=!0,i=q=0,u=L.length;u>q;i=++q)for(K=L[i],o=null!=H[i]?H[i]:H[i]=[],h=null!=(w=K.elements)?w:[K],k=t=0,v=h.length;v>t;k=++t)g=h[k],n=null!=o[k]?o[k]:o[k]=new m(g),f&=n.done,n.done||(e++,p+=n.tick(b));return d=p/e,r.update(M.tick(b,d)),r.done()||f||s?(r.update(100),j.trigger("done"),setTimeout(function(){return r.finish(),j.running=!1,j.trigger("hide")},Math.max(D.ghostTime,Math.max(D.minTime-(C()-a),0)))):c()})},j.start=function(a){v(D,a),j.running=!0;try{r.render()}catch(b){i=b}return document.querySelector(".pace")?(j.trigger("start"),j.go()):setTimeout(j.start,50)},"function"==typeof define&&define.amd?define(["pace"],function(){return j}):"object"==typeof exports?module.exports=j:D.startOnPageLoad&&j.start()}).call(this);