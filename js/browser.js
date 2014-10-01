var igv = (function (igv) {

    const MIN_TRACK_WIDTH = 500;

    igv.Browser = function (type) {

        this.type = type ? type : "IGV";
        this.div =$('<div id="igvRootDiv" class="igv-root-div">')[0];

        this.trackHeight = 100;
        $("input[id='trackHeightInput']").val(this.trackHeight);

        this.rootHeight = 0;
        this.searchURL = "http://www.broadinstitute.org/webservices/igv/locus?genome=hg19&name=";


        if (type === "GTEX") {
            this.flanking = 1000000;
        }

    };

    igv.Browser.prototype.loadTrack = function (descriptor) {

        var attemptedDuplicateTrackAddition = false;

        this.trackPanels.forEach(function (tp, tps, index) {

            if (false === attemptedDuplicateTrackAddition) {

                if (JSON.stringify(descriptor) === JSON.stringify(tp.track.descriptor)) {
                    attemptedDuplicateTrackAddition = true;
                }

            }
        });

        if (true === attemptedDuplicateTrackAddition) {

            window.alert("Attempt to load duplicate track.");
            return;
        }

        var path = descriptor.url;

        if (descriptor.type && descriptor.type === 't2d') {
            this.addTrack(new igv.T2dTrack(descriptor));
        } else if (path.endsWith(".bed") || path.endsWith(".bed.gz")) {
            this.addTrack(new igv.GeneTrack(descriptor));
        } else if (path.endsWith(".bam")) {
            this.addTrack(new igv.BAMTrack(descriptor));
        } else if (path.endsWith(".wig") || path.endsWith(".wig.gz") || path.endsWith(".bedgraph") || path.endsWith(".bedgraph.gz")) {
            this.addTrack(new igv.WIGTrack(descriptor));
        }

        // TODO -- error message "unsupported filed type"

    };

    /**
     * Add a new track.  Each track is associated with the following DOM elements
     *
     *      controlDiv  - div on the left for track controls and legend
     *      contentDiv  - a div element wrapping all the track content.  Height can be > viewportDiv height
     *      viewportDiv - a div element through which the track is viewed.  This might have a vertical scrollbar
     *      canvas     - canvas element upon which the track is drawn.  Child of contentDiv
     *
     * The width of all elements should be equal.  Height of the viewportDiv is controlled by the user, but never
     * greater than the contentDiv height.   Height of contentDiv and canvas are equal, and governed by the data
     * loaded.
     *
     * @param track
     * @param position
     */
    igv.Browser.prototype.addTrack = function (track, position) {

        var browser = this,
            trackView = new igv.TrackView(track, this);

        if (trackView.track instanceof igv.EqtlTrack) {
            trackView.trackDiv.style.height = this.trackHeight + "px";
            trackView.canvas.height = this.trackHeight;
            trackView.canvas.style.height = this.trackHeight + "px";
            trackView.controlDiv.style.height = this.trackHeight + "px";
            trackView.controlCanvas.height = this.trackHeight;
            trackView.controlCanvas.style.height = this.trackHeight + "px";
            trackView.viewportDiv.style.height = this.trackHeight + "px";
        }

        this.trackContainerDiv.appendChild(trackView.trackDiv);

        trackView.order = track.order || this.trackPanels.length;

        this.trackPanels.push(trackView);

        // Keeps the tracks in the right order and the Gene track pinned to the bottom
        this.trackPanels.sort(function (a, b) {
            var aOrder = a.order || 0;
            var bOrder = b.order || 0;
            return aOrder - bOrder;
        });


        if (this.cursorModel) {
            this.cursorModel.initializeHistogram(trackView.track, function () {
                browser.resize();
            });
        }
        else {
            this.resize();
            //trackView.repaint();
        }

    };

    igv.Browser.prototype.removeTrack = function (track) {

        // Find track panel
        var trackPanelRemoved;
        for (var i = 0; i < this.trackPanels.length; i++) {
            if (track === this.trackPanels[i].track) {
                trackPanelRemoved = this.trackPanels[i];
                break;
            }
        }

        if (trackPanelRemoved) {

            this.trackPanels.splice(this.trackPanels.indexOf(trackPanelRemoved), 1);
            this.trackContainerDiv.removeChild(trackPanelRemoved.trackDiv);

        }
    };

    igv.Browser.prototype.setTrackHeight = function (newHeight) {

        this.trackHeight = newHeight;

        this.trackPanels.forEach(function (panel) {
            panel.setTrackHeight(newHeight);
        });

    };


    igv.Browser.prototype.resize = function () {
        if (this.ideoPanel) this.ideoPanel.resize();
        if (this.karyoPanel) this.karyoPanel.resize();
        this.trackPanels.forEach(function (panel) {
            panel.resize();
        })
    }

    igv.Browser.prototype.repaint = function () {

        if (this.ideoPanel) {
            this.ideoPanel.repaint();
        }

        if (this.karyoPanel) {
            this.karyoPanel.repaint();
        }
        this.trackPanels.forEach(function (trackView) {
            trackView.repaint();
        });

        if (this.cursorModel) {
            this.horizontalScrollbar.update(this.cursorModel, this.referenceFrame);
        }

    };

    igv.Browser.prototype.update = function () {

        if (this.ideoPanel) {
            this.ideoPanel.repaint();
        }

        if (this.karyoPanel) {
            this.karyoPanel.repaint();
        }
        this.trackPanels.forEach(function (trackPanel) {

            trackPanel.update();

        });

        if (this.cursorModel) {
            this.horizontalScrollbar.update(this.cursorModel, this.referenceFrame);
        }
    };

    /**
     * Return the visible width of a track.  All tracks should have the same width.
     */
    igv.Browser.prototype.trackViewportWidth = function () {

        var width;

        if (this.trackPanels && this.trackPanels.length > 0) {
            width = this.trackPanels[0].viewportDiv.clientWidth;
        }
        else {
            width = this.trackContainerDiv.clientWidth;
        }

        return Math.max(MIN_TRACK_WIDTH, width);

    }

    igv.Browser.prototype.goto = function (chr, start, end) {

        console.log("goto " + chr + ":" + start + "-" + end);

        if (igv.popover) {
            igv.popover.hide();
        }

        // GTEX HACK -- need aliases
        if (this.type === "GTEX" && !chr.startsWith("chr")) chr = "chr" + chr;

        var w, chromosome, viewportWidth;

        viewportWidth = this.trackViewportWidth();

        this.referenceFrame.chr = chr;

        // If end is undefined,  interpret start as the new center.
        if (!end) {

            w = Math.round(viewportWidth * this.referenceFrame.bpPerPixel / 2);
            start = start - w;
            end = start + 2 * w;
        }

        if (start < 0) {
            end += -start;
            start = 0;
        }

        if (this.genome) {
            chromosome = this.genome.getChromosome(this.referenceFrame.chr);
            if (chromosome && end > chromosome.bpLength) {
                start -= (end - chromosome.bpLength);
                end = chromosome.bpLength;
            }
        }

        this.referenceFrame.start = start;
        this.referenceFrame.bpPerPixel = (end - start) / (viewportWidth);
        this.update();
    }

    // Zoom in by a factor of 2, keeping the same center location
    igv.Browser.prototype.zoomIn = function () {

        var newScale, center, viewportWidth;
        viewportWidth = this.trackViewportWidth();

        newScale = Math.max(1 / 14, this.referenceFrame.bpPerPixel / 2);
        if (newScale == this.referenceFrame.bpPerPixel) return;

        center = this.referenceFrame.start + this.referenceFrame.bpPerPixel * viewportWidth / 2;
        this.referenceFrame.start = center - newScale * viewportWidth / 2;
        this.referenceFrame.bpPerPixel = newScale;
        this.update();
    }

    // Zoom out by a factor of 2, keeping the same center location if possible
    igv.Browser.prototype.zoomOut = function () {

        var newScale, maxScale, center, chrLength, widthBP, viewportWidth;
        viewportWidth = this.trackViewportWidth();

        newScale = this.referenceFrame.bpPerPixel * 2;
        chrLength = 250000000;
        if (this.genome) {
            var chromosome = this.genome.getChromosome(this.referenceFrame.chr);
            if (chromosome) {
                chrLength = chromosome.bpLength;
            }
        }
        maxScale = chrLength / viewportWidth;
        if (newScale > maxScale) newScale = maxScale;

        center = this.referenceFrame.start + this.referenceFrame.bpPerPixel * viewportWidth / 2;
        widthBP = newScale * viewportWidth;

        this.referenceFrame.start = Math.round(center - widthBP / 2);

        if (this.referenceFrame.start < 0) this.referenceFrame.start = 0;
        else if (this.referenceFrame.start > chrLength - widthBP) this.referenceFrame.start = chrLength - widthBP;

        this.referenceFrame.bpPerPixel = newScale;
        this.update();
    }

    igv.Browser.prototype.search = function (feature) {

        console.log("Search " + feature);

        if (feature.contains(":") && feature.contains("-")) {

            var tokens = feature.split(":");
            var chr = tokens[0];
            var posTokens = tokens[1].split("-");
            var start = parseInt(posTokens[0].replace(/,/g, "")) - 1;
            var end = parseInt(posTokens[1].replace(/,/g, ""));

            if (end > start) {
                this.goto(chr, start, end);
            }

        }

        else {

            if (this.searchURL) {

                var spinner = igv.getSpinner(this.trackContainerDiv);
                var url = this.searchURL + feature;
                var browser = this;

                igv.loadData(url, function (data) {


                    spinner.stop();

                    var lines = data.split("\n");
                    var len = lines.length;
                    // First line is header, skip
                    var lineNo = 0;
                    while (lineNo < len) {
                        // EGFR	chr7:55,086,724-55,275,031	refseq
                        var line = lines[lineNo++];
                        //console.log(line);
                        var tokens = line.split("\t");
                        //console.log("tokens lenght = " + tokens.length);
                        if (tokens.length >= 3) {
                            var f = tokens[0];
                            if (f.toUpperCase() == feature.toUpperCase()) {

                                var source = tokens[2].trim();
                                var type = source == "gtex" ? 'snp' : 'gene';

                                var locusTokens = tokens[1].split(":");
                                var chr = locusTokens[0].trim();
                                var rangeTokens = locusTokens[1].split("-");
                                var start = parseInt(rangeTokens[0].replace(/,/g, ''));
                                var end = parseInt(rangeTokens[1].replace(/,/g, ''));

                                if(browser.flanking) {
                                    start -= browser.flanking;
                                    end += browser.flanking;
                                }

                                if (browser.type === "GTEX") {
                                    igv.selection = new igv.GtexSelection(type == 'gene' ? {gene: feature} : {snp: feature});
                                    browser.goto(chr, start, end);
                                    browser.update();
                                }
                                else {
                                    browser.goto(chr, start, end);
                                }

                                return;
                            }
                        }
                    }
                    // Nothing found
                    alert('No feature found with name "' + feature + '"');
                });
            }
        }
    }

    return igv;
})(igv || {});


