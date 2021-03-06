/**
 * This is an experimental Highcharts module that draws long data series on a canvas
 * in order to increase performance of the initial load time and tooltip responsiveness.
 *
 * Compatible with HTML5 canvas-compatible browsers (not IE < 9).
 *
 * Author: Torstein Honsi
 */

(function (H) {
    var CHUNK_SIZE = 50000,
        noop = function () {},
        Series = H.Series,
        seriesTypes = H.seriesTypes,
        each = H.each,
        wrap = H.wrap;

    function eachAsync (arr, fn, callback, i) {
        i = i || 0;
        each(arr.slice(i, i + CHUNK_SIZE - 1), fn);
        if (i < arr.length) {
            setTimeout(function () {
                eachAsync(arr, fn, callback, i + CHUNK_SIZE);
            });
        } else if (callback) {
            callback();
        }
    }

    H.extend(Series.prototype, {
        _setData: function () {
            this.points = [];
        },
        _processData: noop,
        translate: noop,
        generatePoints: noop,
        _getExtremes: noop,
        drawTracker: noop,
        pointRange: 0,
        drawPoints: noop,

        /**
         * Create a hidden canvas to draw the graph on. The contents is later copied over 
         * to an SVG image element.
         */
        getContext: function () {
            var width = this.chart.plotWidth,
                height = this.chart.plotHeight;

            if (!this.canvas) {
                this.canvas = document.createElement('canvas');
                this.image = this.chart.renderer.image('', 0, 0, width, height).add(this.group);
                this.ctx = this.canvas.getContext('2d');
            } else {
                this.ctx.clearRect(0, 0, width, height);
            }

            this.canvas.setAttribute('width', width);
            this.canvas.setAttribute('height', height);
            this.image.attr({
                width: width,
                height: height
            });

            return this.ctx;
        },

        /** 
         * Draw the canvas image inside an SVG image
         */
        canvasToSVG: function () {
            this.image.attr({ href: this.canvas.toDataURL('image/png') });
        },

        cvsLineTo: function (ctx, clientX, plotY) {
            ctx.lineTo(clientX, plotY);
        },

        drawGraph: function () {
            var series = this,
                chart = series.chart,
                xAxis = this.xAxis,
                yAxis = this.yAxis,
                ctx,
                lastClientX,
                i,
                c = 0,
                xData = series.processedXData,
                yData = series.processedYData,
                len = xData.length,
                clientX,
                plotY,
                stroke = function () {
                    if (cvsLineTo) {
                        ctx.strokeStyle = series.color;
                        ctx.lineWidth = series.options.lineWidth;
                        ctx.stroke();
                    } else {
                        ctx.fillStyle = series.color;
                        ctx.fill();
                    }
                },
                cvsLineTo = this.options.lineWidth ? this.cvsLineTo : false,
                cvsMarker = this.cvsMarker;

            this.points = [];
            ctx = this.getContext();
            series.buildKDTree = noop; // Do not start building while drawing 

            if (xData.length > 99999) {
                chart.showLoading('Drawing...');
            }

            i = 0;
            eachAsync(xData, function (x) {
                clientX = Math.round(xAxis.toPixels(x, true));
                plotY = yAxis.toPixels(yData[i], true);

                if (c === 0) {
                    ctx.beginPath();
                }

                // The k-d tree requires series points
                if (clientX !== lastClientX) {
                    series.points.push({
                        clientX: clientX,
                        plotX: clientX,
                        plotY: plotY,
                        i: i
                    });
                    lastClientX = clientX;
                }

                if (cvsLineTo) {
                    cvsLineTo(ctx, clientX, plotY);
                } else if (cvsMarker) {
                    cvsMarker(ctx, clientX, plotY);
                }

                // We need to stroke the line for every 1000 pixels. It will crash the browser
                // memory use if we stroke too infrequently.
                c = c + 1;
                if (c === 1000) {
                    stroke();
                    c = 0;
                }
                i = i + 1;

                if (i % CHUNK_SIZE === 0) {
                    series.canvasToSVG();
                }

            }, function () {
                stroke();
                series.canvasToSVG();
                chart.hideLoading();
                delete series.buildKDTree; // Go back to prototype, ready to build
            });
        }
    });

    seriesTypes.scatter.prototype.drawGraph = Series.prototype.drawGraph; // Draws markers too
    seriesTypes.scatter.prototype.cvsMarker = function (ctx, clientX, plotY) {
        ctx.moveTo(clientX, plotY);
        ctx.arc(clientX, plotY, 1, 0, 2 * Math.PI, false);
    };

    /**
     * Return a point instance from the k-d-tree
     */
    wrap(Series.prototype, 'searchPoint', function (proceed, e) {
        var point = proceed.call(this, e),
            ret;

        if (point) {
            ret = (new this.pointClass()).init(this, this.options.data[point.i]);
            ret.dist = point.dist;
            ret.plotX = point.plotX;
            ret.plotY = point.plotY;
        }
        return ret;
    });
}(Highcharts));