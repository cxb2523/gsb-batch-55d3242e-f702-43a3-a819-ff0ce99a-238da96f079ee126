var pl;
(function( pl ) {

	var width = function( ctx, font, margin, padding ) {
		ctx.font = font;
		ctx.textAlign = "center";
		return Math.max( ctx.measureText( this.text_goal ).width, ctx.measureText( this.text_substitution ).width ) + ( 2 * margin ) + ( 2 * padding );
	};

	var contains = function( obj, arr ) {
			for( var i = 0; i < arr.length; i++ )
				if( arr[i] === obj )
					return true;
		return false;
	};

	var get_states_by_level = function( parent ) {
		var levels = [];
		var i = 0;
		do {
			var level = get_states_at_level( [parent], i );
			if( level.length != 0 ) 
				levels.push( level );
			i++;
		} while( level.length != 0 );
		for( i = 0; i < levels.length; i++ )
			for( var j = 0; j < levels[i].length; j++ )
				levels[i][j].id_canvas_level = j;
		return levels;
	};

	var get_states_at_level = function( nodes, level ) {
		if(level == 0)
			return nodes;
		var children = [];
		for(var i = 0; i < nodes.length; i++)
			children = children.concat( get_states_at_level( nodes[i].children, level-1 ) );
		return children;
	};
	
	var set_preorder_id = function( node, id ) {
		node.preorder_id = id;
		for( var i = 0; i < node.children.length; i++ ) {
			id++;
			id = set_preorder_id( node.children[i], id );
		}
		return id++;
	};
	
	var clear_substitution = function( subs ) {
		var links = {};
		for( var x in subs.links ) {
			if(!subs.links.hasOwnProperty(x)) continue;
			var link = subs.links[x];
			if( !pl.type.is_variable(link) || link.id != x )
				links[x] = link;
		}
		return new pl.type.Substitution( links );
	};
	
	var set_style = function( obj, name, value ) {
		if( typeof obj[name] === "undefined" )
			obj[name] = value;
	};

	// Built-in default styles. These are the historical hard-coded defaults and
	// are also the fallback used when a theme cannot be loaded.
	var default_styles = function() {
		return {
			"font-size": 14,
			"font-family": "Monospace, Courier New",
			"border-width": 2,
			"border-color": "#43207a",
			"padding": 5,
			"margin-x": 10,
			"margin-y": 20,
			"order": {
				"radius": 15,
				"background-color": "#43207a",
				"border-width": 4,
				"border-color": "#43207a",
				"font-color": "#ffffff"
			},
			"state": {
				"background-color": "#e0ccfd",
				"border-width": 4,
				"border-color": "#43207a",
				"font-color": "#43207a"
			},
			"answer": {
				"background-color": "#a7e3a7",
				"border-width": 4,
				"border-color": "#0b6a0d",
				"font-color": "#0b6a0d"
			},
			"error": {
				"background-color": "#ecc2c2",
				"border-width": 4,
				"border-color": "#881717",
				"font-color": "#881717"
			}
		};
	};

	var is_plain_object = function( value ) {
		return value !== null && typeof value === "object" && !Array.isArray( value );
	};

	// Merge source into base, with source values taking precedence. Nested
	// sections (order, state, answer, error) are merged recursively so a
	// partial caller style keeps the values provided by the theme.
	var merge_styles = function( base, source ) {
		if( !is_plain_object( source ) )
			return base;
		for( var key in source ) {
			if( !source.hasOwnProperty(key) || typeof source[key] === "undefined" )
				continue;
			if( is_plain_object( source[key] ) ) {
				var nested = is_plain_object( base[key] ) ? base[key] : {};
				base[key] = merge_styles( nested, source[key] );
			} else if( source[key] !== null && typeof source[key] !== "object" ) {
				base[key] = source[key];
			}
		}
		return base;
	};

	// Precedence: built-in defaults < theme < explicit caller styles.
	var compose_styles = function( caller_styles, theme ) {
		var styles = default_styles();
		if( theme )
			merge_styles( styles, theme );
		if( caller_styles )
			merge_styles( styles, caller_styles );
		if( typeof styles["font"] === "undefined" )
			styles["font"] = styles["font-size"] + "px " + styles["font-family"];
		return styles;
	};

	var theme_url = function( name, options ) {
		if( typeof options.themeUrl === "string" )
			return options.themeUrl.replace( "{name}", name );
		var base = typeof options.themePath === "string" ? options.themePath : "themes/";
		return base + ( /\.json$/i.test( name ) ? name : name + ".json" );
	};

	var parse_theme = function( data, url ) {
		var theme = data;
		if( typeof theme === "string" ) {
			try {
				theme = JSON.parse( theme );
			} catch( e ) {
				throw new Error( "Could not parse theme \"" + url + "\": " + e.message );
			}
		}
		if( !is_plain_object( theme ) )
			throw new Error( "Theme \"" + url + "\" does not contain a JSON object" );
		return theme;
	};

	var report_theme_error = function( options, error, url ) {
		if( typeof options.onThemeError === "function" ) {
			try {
				options.onThemeError( error, options.theme, url );
			} catch( e ) {
				// A failing error handler must not stop the tree from being drawn.
			}
		}
	};

	var load_theme = function( options ) {
		var name = options.theme;
		// Themes may also be supplied directly by the caller (handy when
		// fetch/XHR is unavailable, e.g. embedding or automated tests).
		if( is_plain_object( options.themes ) && options.themes.hasOwnProperty( name ) )
			return Promise.resolve( options.themes[name] ).then(function( theme ) {
				return parse_theme( theme, name );
			});
		var url = theme_url( name, options );
		if( typeof fetch === "function" ) {
			return Promise.resolve( fetch( url ) ).then(function( response ) {
				if( !response )
					throw new Error( "Could not load theme \"" + url + "\"" );
				if( typeof response.ok === "boolean" && !response.ok )
					throw new Error( "Could not load theme \"" + url + "\" (HTTP " + response.status + ")" );
				if( typeof response.text === "function" )
					return Promise.resolve( response.text() ).then(function( text ) {
						return parse_theme( text, url );
					});
				if( typeof response.json === "function" )
					return Promise.resolve( response.json() ).then(function( json ) {
						return parse_theme( json, url );
					});
				return parse_theme( response, url );
			});
		}
		if( typeof XMLHttpRequest !== "undefined" ) {
			return new Promise(function( resolve, reject ) {
				var request = new XMLHttpRequest();
				request.open( "GET", url, true );
				request.onreadystatechange = function() {
					if( request.readyState !== 4 )
						return;
					if( ( request.status >= 200 && request.status < 300 ) || request.status === 0 ) {
						try {
							resolve( parse_theme( request.responseText, url ) );
						} catch( e ) {
							reject( e );
						}
					} else {
						reject( new Error( "Could not load theme \"" + url + "\" (HTTP " + request.status + ")" ) );
					}
				};
				request.onerror = function() {
					reject( new Error( "Could not load theme \"" + url + "\"" ) );
				};
				try {
					request.send();
				} catch( e ) {
					reject( e );
				}
			});
		}
		return Promise.reject( new Error( "No mechanism available to load theme \"" + url + "\"" ) );
	};

	var device_pixel_ratio = function() {
		var ratio = 1;
		if( typeof window !== "undefined" && typeof window.devicePixelRatio === "number" )
			ratio = window.devicePixelRatio;
		return ratio > 0 && isFinite( ratio ) ? ratio : 1;
	};

	var init = function( thread, max, canvas, styles, options ) {
		styles = styles ? styles : {};
		options = options ? options : {};
		options.session = thread.session;
		// A theme is loaded asynchronously; the tree is drawn exactly once, and
		// only after every style value is known. Anything that fails during
		// loading falls back to the built-in defaults.
		if( options.theme ) {
			var url = theme_url( options.theme, options );
			return load_theme( options ).then(function( theme ) {
				return compose_styles( styles, theme );
			}, function( error ) {
				report_theme_error( options, error, url );
				return compose_styles( styles, null );
			}).then(function( resolved_styles ) {
				return new Promise(function( resolve, reject ) {
					begin( thread, max, canvas, resolved_styles, options, { resolve: resolve, reject: reject } );
				});
			});
		}
		set_style( styles, "font-size", 14 );
		set_style( styles, "font-family", "Monospace, Courier New" );
		set_style( styles, "font", styles["font-size"] + "px " + styles["font-family"] );
		set_style( styles, "border-width", 2 );
		set_style( styles, "border-color", "#43207a" );
		set_style( styles, "padding", 5 );
		set_style( styles, "margin-x", 10 );
		set_style( styles, "margin-y", 20 );
		set_style( styles, "node", {} );
		set_style( styles, "order", {} );
		set_style( styles, "state", {} );
		set_style( styles, "answer", {} );
		set_style( styles, "error", {} );
		set_style( styles["order"], "radius", 15 );
		set_style( styles["order"], "background-color", "#43207a" );
		set_style( styles["order"], "border-width", 4 );
		set_style( styles["order"], "border-color", "#43207a" );
		set_style( styles["order"], "font-color", "#ffffff" );
		set_style( styles["state"], "background-color", "#e0ccfd" );
		set_style( styles["state"], "border-width", 4 );
		set_style( styles["state"], "border-color", "#43207a" );
		set_style( styles["state"], "font-color", "#43207a" );
		set_style( styles["answer"], "background-color", "#a7e3a7" );
		set_style( styles["answer"], "border-width", 4 );
		set_style( styles["answer"], "border-color", "#0b6a0d" );
		set_style( styles["answer"], "font-color", "#0b6a0d" );
		set_style( styles["error"], "background-color", "#ecc2c2" );
		set_style( styles["error"], "border-width", 4 );
		set_style( styles["error"], "border-color", "#881717" );
		set_style( styles["error"], "font-color", "#881717" );
		begin( thread, max, canvas, styles, options );
	};

	var begin = function( thread, max, canvas, styles, options, callbacks ) {
		// Get parent node
		var parent = thread.points[0];
		if(typeof parent === "undefined") {
			if( callbacks )
				callbacks.resolve();
			return;
		}
		// Get answer states
		var answers = [];
		var format_success = thread.format_success;
		var format_error = thread.format_error;
		var deb = thread.debugger;
		var id = function(x) { return x };
		var finish = function( error ) {
			if( callbacks ) {
				if( error )
					callbacks.reject( error );
				else
					callbacks.resolve();
			} else if( error ) {
				throw error;
			}
		};
		var after = function() {
			thread.format_success = format_success;
			thread.format_error = format_error;
			thread.debugger = deb;
			try {
				answers = thread.debugger_states;
				// Set pointers to child nodes
				for(var i = 0; i < answers.length; i++) {
					var state = answers[i];
					var child = null;
					while( state != null ) {
						state.text_goal = state.goal === null ? "□" : state.goal.toString( options );
						state.text_substitution = clear_substitution(state.substitution).toString( options );
						state.width = width;
						if(state.children == null)
							state.children = [];
						if( child != null && !contains(child, state.children) )
							state.children.push( child );
						child = state;
						state = state.parent;
					}
				}
				// Set preorder id
				set_preorder_id( parent, 0 );
				// Get nodes by level
				var levels = get_states_by_level( parent );
				draw( levels, canvas, styles );
			} catch( e ) {
				finish( e );
				return;
			}
			finish();
		};
		thread.format_success = id;
		thread.format_error = id;
		thread.debugger = true;
		thread.answers( function(x) { if(x) x.status = "answer"; }, max, after );
	};

	var draw = function( tree, canvas_id, styles ) {
		// Graph configuration
		var padding = styles["padding"];
		var margin_x = styles["margin-x"];
		var margin_y = styles["margin-y"];
		var font_size = styles["font-size"];
		var radius = styles["order"]["radius"];
		// Get container, canvas and context
		var canvas = typeof canvas_id === "string" && typeof document !== "undefined" ? document.getElementById(canvas_id) : canvas_id;
		var ctx = canvas.getContext("2d");
		// Maximum width of each level
		var maxwidth = tree.map(function(a){return a.reduce(function(b,c){return b + c.width(ctx, styles["font"], margin_x, padding)}, 0)}, 0);
		// Width of the image
		var width = maxwidth.reduce(function(a,b){return Math.max(a,b)}, 0);
		// Get height of state blocks, levels and image
		var unifier_height = (padding * 3) + ((font_size + 2) * 2);
		var level_height = (radius * 2) + (margin_y * 2) + unifier_height;
		var height = level_height * tree.length - (2 * radius);
		// Set canvas properties. The backing store is scaled by the device pixel
		// ratio while the CSS size keeps the layout dimensions, so text and
		// lines stay sharp on high-density displays. Reading the ratio on every
		// draw makes a later call pick up a changed devicePixelRatio.
		var ratio = device_pixel_ratio();
		canvas.width = Math.round( width * ratio );
		canvas.height = Math.round( height * ratio );
		if( canvas.style ) {
			canvas.style.width = width + "px";
			canvas.style.height = height + "px";
		}
		// Resizing the canvas resets the context; map drawing coordinates back
		// to CSS pixels.
		if( typeof ctx.setTransform === "function" )
			ctx.setTransform( 1, 0, 0, 1, 0, 0 );
		ctx.scale( ratio, ratio );

		// CLEAR CANVAS
		ctx.clearRect(0, 0, width, height);
		
		// DRAW LINES
		
		// Relative centers to other levels
		var relative = [];
		// Height
		var offset_y = margin_y;
		var offset_z = margin_y;
		// Iterate levels
		for (var i = 0; i < tree.length; i++) {
			// Push centers for following levels
			relative.push([]);
			// Get offset
			var offset_x = (width - maxwidth[i]) / 2;
			// Iterate states
			for (var j = 0; j < tree[i].length; j++) {
				// Get initial offset
				offset_z = offset_y;
				// Set relative center
				var center = offset_x + (tree[i][j].width(ctx, styles["font"], margin_x, padding) / 2);
				relative[i].push(center);
				if (i > 0) {
					// Draw lines
					ctx.lineWidth = styles["border-width"];
					ctx.strokeStyle = styles["border-color"];
					ctx.beginPath();
					ctx.moveTo(relative[i-1][tree[i][j].parent.id_canvas_level], offset_y - unifier_height / 2);
					ctx.lineTo(center, offset_y + 2 * (margin_y + radius));
					ctx.closePath();
					ctx.stroke();
					// Draw rule
					offset_z += 2 * (margin_y + radius)
				}
				offset_z += unifier_height;
				// Update offset
				offset_x += tree[i][j].width(ctx, styles["font"], margin_x, padding);
			}
			// Update offset
			offset_y = offset_z;
		}
		
		// DRAW BLOCKS
		
		// Relative centers to other levels
		relative = [];
		// Height
		offset_y = margin_y;
		offset_z = margin_y;
		// Iterate levels
		for (i = 0; i < tree.length; i++) {
			// Push centers for following levels
			relative.push([]);
			// Get offset
			offset_x = (width - maxwidth[i]) / 2;
			// Iterate states
			for (j = 0; j < tree[i].length; j++) {
				// Get initial offset
				offset_z = offset_y;
				// Set relative center
				center = offset_x + (tree[i][j].width(ctx, styles["font"], margin_x, padding) / 2);
				relative[i].push(center);
				if (i > 0) {
					var x1 = Math.abs(relative[i-1][tree[i][j].parent.id_canvas_level] - center);
					var y1 = 2 * (radius + margin_y) + unifier_height / 2;
					var y3 = margin_y + radius;
					var alpha = Math.atan(y1 / x1);
					var y4 = y3 + radius * Math.sin(alpha);
					var x3 = y3 / (Math.tan(alpha));
					var x4 = x3 - radius * Math.cos(alpha);
					if (relative[i-1][tree[i][j].parent.id_canvas_level] < center) {
						x3 = -x3;
						x4 = -x4;
					}
					// Draw rule
					offset_z += margin_y + radius;
							ctx.fillStyle = styles["order"]["background-color"];
							ctx.strokeStyle = styles["order"]["border-color"];
							ctx.lineWidth = styles["order"]["border-width"];
							ctx.beginPath();
							ctx.arc(center + x3, offset_z, radius, 0, 2 * Math.PI);
							ctx.closePath();
							ctx.stroke();
							ctx.fill();
						ctx.fillStyle = styles["order"]["font-color"];
						ctx.font = "bold " + styles["font"];
						ctx.textAlign = "center"; 
						ctx.fillText(tree[i][j].preorder_id, center + x3, offset_z + font_size / 2 - 1);
					offset_z += radius + margin_y;
				}
				// Draw state
				var type_state;
				if(tree[i][j].status && tree[i][j].status === "answer") // Answer
					type_state = "answer";
				else if(tree[i][j].children.length == 0 && tree[i][j].goal !== null) // Error
					type_state = "error";
				else
					type_state = "state";
				ctx.fillStyle = styles[type_state]["background-color"];
				ctx.strokeStyle = styles[type_state]["border-color"];
				ctx.lineWidth = styles[type_state]["border-width"];
				ctx.beginPath();
				ctx.rect(center - tree[i][j].width(ctx, styles["font"], 0, padding) / 2, offset_z, tree[i][j].width(ctx, styles["font"], 0, padding), unifier_height);
				ctx.closePath();
				ctx.stroke();
				ctx.fill();
				ctx.fillStyle = styles[type_state]["font-color"];
				ctx.font = styles["font"];
				ctx.textAlign = "center"; 
				ctx.fillText(tree[i][j].text_goal, center, offset_z + padding + font_size);
				ctx.fillText(tree[i][j].text_substitution, center, offset_z + (2 * font_size) + (2 * padding));
				offset_z += unifier_height;
				// Update offset
				offset_x += tree[i][j].width(ctx, styles["font"], margin_x, padding);
			}
			// Update offset
			offset_y = offset_z;
		}
		// Add click event
		var click_draw = function(){ window.open(canvas.toDataURL(), '_blank'); };
		if (canvas.addEventListener) {
			if(canvas.click_draw)
				canvas.removeEventListener("click", canvas.click_draw);
			canvas.addEventListener("click", click_draw, false);
			canvas.style.cursor = "pointer";
		} else {
			if (canvas.attachEvent) {
				if(canvas.click_draw)
					canvas.detachEvent("click", canvas.click_draw);
				canvas.attachEvent("click", click_draw);
				canvas.style.cursor = "pointer";
			}
		}
		canvas.click_draw = click_draw;
	};
	


	if( typeof module !== 'undefined' ) {
		module.exports = function( p ) {
			pl = p;
			pl.type.Thread.prototype.draw = function( max, canvas, styles, options ) { return init( this, max, canvas, styles, options ); };
			pl.type.Session.prototype.draw = function( max, canvas, styles, options ) { return this.thread.draw( max, canvas, styles, options ); };
		};
	} else {
		pl.type.Thread.prototype.draw = function( max, canvas, styles, options ) { return init( this, max, canvas, styles, options ); };
		pl.type.Session.prototype.draw = function( max, canvas, styles, options ) { return this.thread.draw( max, canvas, styles, options ); };
	}

})( pl );
