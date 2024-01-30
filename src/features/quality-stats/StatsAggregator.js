const { percentOf, round, standardizedMoment, average } = require('../../utils/utils');

/**
 *
 */
class StatsAggregator {
    /**
     * Publish features related to a specific peer connection track.
     *
     * @param {Object} track - extracted track features.
     * @param {Object} param1 - additional track related metadata.
     */
    calculateFreeze(packets, packetsLost, freezeThreshold = 5) {
        /**
         * Calculates the audio freeze rate, handles freezes, logs stats, and returns freeze percentage and duration.
         *
         * @param {number[]} packets - Array of cumulative packets received.
         * @param {number[]} packetsLost - Array of packets lost at each point in time.
         * @param {number} freezeThreshold - Threshold for freeze detection (percentage).
         * @returns {{ freezePercentage: number, freezeDuration: number }} - Object containing freeze percentage and duration.
         */
    
        if (packets.length === 0 || packets.length !== packetsLost.length) {
            console.log("Invalid input arrays");
            return null;
        }
    
        let freezeStartTime = null;
        let totalFreezeDuration = 0;
        let totalPacketsReceived = packets[packets.length - 1];
        let totalPacketsLost = 0;
    
        for (let i = 1; i < packets.length; i++) {
            const currentPacketsReceived = packets[i] - packets[i - 1]; // Calculate current packets received
            const currentPacketsLost = packetsLost[i]; // Use packetsLost directly
    
            const freezeRate = (currentPacketsLost / currentPacketsReceived) * 100;
    
            if (freezeRate >= freezeThreshold) {
                if (!freezeStartTime) {
                    freezeStartTime = new Date(); // Start recording freeze timeframe
                }
            } else if (freezeStartTime) {
                const freezeEndTime = new Date();
                const freezeDuration = (freezeEndTime - freezeStartTime) / 1000; // Convert to seconds
                totalFreezeDuration += freezeDuration;
                totalPacketsLost += currentPacketsLost;
                freezeStartTime = null; // Reset freeze start time
            }
        }
        
        if (totalPacketsLost === 0) {
            return { freezePercentage: 0, freezeDuration: 0 };
        }
    
        const totalFreezePercentage = (totalPacketsLost / totalPacketsReceived) * 100;    
        return { freezePercentage: totalFreezePercentage, freezeDuration: totalFreezeDuration };
    }

    /**
     * Calculate aggregates associated with the peer connection tracks
     *
     * @param {Object} pcData - Data associated with a single peer connection.
     * @returns
     */
    _calculateTrackAggregates(pcData) {
        let totalPacketsSent = 0;
        let totalSentPacketsLost = 0;
        let totalPacketsReceived = 0;
        let totalReceivedPacketsLost = 0;

        const tracks = this._getTracks(pcData);

        // packetsLost and packetsSent are sent as totals for each point in time they were collected, thus
        // the last value in the array is going to be the total lost/sent for a track.
        // We then add them together to get the totals for the peer connection.
        tracks.forEach(track => {
            const { packetsSentLost = [], packetsSent = [],
                packetsReceivedLost = [], packetsReceived = [] } = track;

            if (packetsSentLost.length && packetsSent.length) {
                totalPacketsSent += packetsSent.at(-1);
                totalSentPacketsLost += packetsSentLost.at(-1);
            }

            if (packetsReceivedLost.length && packetsReceived.length) {
                totalReceivedPacketsLost += packetsReceivedLost.at(-1);
                totalPacketsReceived += packetsReceived.at(-1);
            }
        });

        let sentPacketsLostPct = 0;

        if (totalPacketsSent
            && totalSentPacketsLost > 0
            && totalSentPacketsLost < totalPacketsSent) {
            sentPacketsLostPct = percentOf(totalSentPacketsLost, totalPacketsSent) || 0;
        }
        let receivedPacketsLostPct = 0;

        if (totalPacketsReceived
            && totalReceivedPacketsLost > 0
            && totalReceivedPacketsLost < totalPacketsReceived) {
            receivedPacketsLostPct = percentOf(totalReceivedPacketsLost, totalPacketsReceived) || 0;
        }

        return {
            totalSentPacketsLost,
            totalPacketsSent,
            sentPacketsLostPct,
            totalReceivedPacketsLost,
            totalPacketsReceived,
            receivedPacketsLostPct
        };
    }


    /**
     * Converts a series of ever increasing values and returns a series of differences
     *
     * @param {Array} series - an array of increasing numbers
     * @return {Array}
     */
    _calculateSeriesDifferences(series) {
        const result = [];

        if (series.length > 0) {
            for (let i = 1; i < series.length; i++) {
                result.push(series[i] - series[i - 1]);
            }
        }

        return result;
    }

    /**
     * The duration for which the PeerConnection was active since ice connection was successful.
     *
     * @param {*} pcData
     */
    _calculateSessionDurationMs(pcData) {
        const { startTime, endTime } = pcData;

        if (startTime && endTime && (endTime > startTime)) {
            return endTime - startTime;
        }

        return 0;
    }

    /**
     * Calculate the stats for a single track.
     *
     * @param {Array} packets - a list of numbers of received/send packets
     * @param {Array} packetsLost - a list of number of missing packets
     * @param {String} mediaType - indicated if the track was audio or video
     * @param {String} videoType - optional parameter that indicates the video type of the track
     * @return {Object}
     */
    _calculateSingleTrackStats(trackStats, mediaType, ssrc) {
        const stats = {
            mediaType,
            ssrc,
            packets: 0,
            packetsLost: 0,
            packetsLostPct: 0,
            packetsLostVariance: 0,
            concealedPercentage: 0
        };

        const { packets, packetsLost, samplesReceived, concealedSamples, startTime, endTime } = trackStats;
        const { freezeDuration, freezePercentage } = this.calculateFreeze(packets, packetsLost);
        stats.freezeDuration = freezeDuration;
        stats.freezePercentage = freezePercentage;

        if (!packets.length) {
            return stats;
        }
        stats.startTime = startTime;
        stats.endTime = endTime;
        const pcts = packets.at(-1);

        stats.packets = pcts;
        const pctsLost = packetsLost.at(-1);

        stats.packetsLost = pctsLost;

        if (pcts
            && pctsLost > 0
            && pctsLost < pcts) {
            stats.packetsLostPct = percentOf(pctsLost, pcts) || 0;
        }

        stats.packetsLostVariance = standardizedMoment(
            this._calculateSeriesDifferences(packetsLost), 2);

        if (samplesReceived.length && concealedSamples.length) {
            const concealed = concealedSamples.at(-1);
            const received = samplesReceived.at(-1);

            stats.concealedPercentage = percentOf(concealed, received) || 0;
        }
        return stats;
    }

    /**
     * Gets all the tracks that are held in the specified peer connection. It includes the "vacuumed" tracks, if there
     * are any.
     *
     * @param {Object} pcData - Data associated with a single peer connection.
     * @returns {array} - An array of all the tracks.
     */
    _getTracks(pcData) {
        // pcData is a dictionary of objects related to a specific peer connection. We store tracks by their ssrc, so
        // the key is the ssrc and the track data is the value of the dictionary entry. We get the tracks by checking
        // that the mediaType attribute exists. Other objects that we store in the pcData dictionary don't have the
        // mediaType attribute.
        let tracks = Object.keys(pcData)
            .filter(pcDataEntry => pcData[pcDataEntry] && pcData[pcDataEntry].mediaType)
            .map(trackSsrc => pcData[trackSsrc]);

        if (pcData.vacuumedTracks) {
            // Only keep tracks that have their mediaType set. Normally every vacuumed track should have a mediaType
            // but -- I guess -- it's possible to receive the `setVideoType` message from the client and no stats for
            // a track that came up and went away very quickly for example.
            tracks = tracks.concat(pcData.vacuumedTracks.filter(track => track.mediaType));
        }

        return tracks;
    }

    /**
     * Calculate the stats for all tracks within a single peer connection
     *
     * @param {Object} pcData - Data associated with a single peer connection.
     * @return {Object} - two maps with stats for all received and send tracks.
     */
    _calculateTrackStats(pcData) {
        const senderTracks = [];
        const receiverTracks = [];

        const tracks = this._getTracks(pcData);

        tracks.forEach(track => {
            const { packetsSentLost = [], packetsSent = [], packetsReceivedLost = [],
                packetsReceived = [], totalSamplesReceived = [], concealedSamplesReceived = [],
                mediaType = '', ssrc, videoType, startTime, endTime } = track;

            let mediaVideoType = mediaType;

            if (videoType) {
                // This parameter is optional and only for video tracks.
                mediaVideoType += `/${videoType}`;
            }

            const trackStats = { 
                samplesReceived: totalSamplesReceived,
                concealedSamples: concealedSamplesReceived,
                startTime,
                endTime 
            };

            if (packetsSentLost.length && packetsSent.length) {
                trackStats.packets = packetsSent;
                trackStats.packetsLost = packetsSentLost;
                senderTracks.push(this._calculateSingleTrackStats(trackStats, mediaVideoType, ssrc));
            }

            if (packetsReceivedLost.length && packetsReceived.length) {
                trackStats.packets = packetsReceived;
                trackStats.packetsLost = packetsReceivedLost;
                receiverTracks.push(this._calculateSingleTrackStats(trackStats, mediaVideoType, ssrc));
            }
        });

        return {
            receiverTracks,
            senderTracks
        };
    }

    /**
     * Calculate aggregates associated with the transport report of a peer connection.
     *
     * @param {*} pcData - Data associated with a single peer connection.
     */
    _calculateTransportAggregates(pcData) {
        const { transport = {} } = pcData;
        const { rtts = [] } = transport;


        // Simply calculate the average rtt for this peer connection, more calculations can be added as needed.
        return {
            meanRtt: round(rtts.reduce(average, 0), 2)
        };
    }

    /**
     * Calculate aggregates associated with the video resolution/frame rate of a peer connection.
     *
     * @param {*} videoSummaries - Data associated with a single peer connection.
     */
    _calculateVideoSummaryAggregates(videoSummaries) {
        if (!Array.isArray(videoSummaries) || videoSummaries.length === 0) {
            return;
        }

        // Simply calculate the average height and FPS for this peer connection, more calculations can be added
        // as needed.
        const result = {
            meanFrameHeight:
                round(videoSummaries.map(videoSummary => videoSummary.frameHeight).reduce(average, 0), 2),
            meanFramesPerSecond:
                round(videoSummaries.map(videoSummary => videoSummary.framesPerSecond).reduce(average, 0), 2)
        };

        if (isNaN(result.meanFramesPerSecond)) {
            delete result.meanFramesPerSecond;
        }

        if (isNaN(result.meanFrameHeight)) {
            delete result.meanFrameHeight;
        }

        return result;
    }

    /**
     * Calculate aggregates associated with the video resolution/frame rate of a peer connection.
     *
     * @param {*} videoExperiences - Data associated with a single peer connection.
     */
    _calculateVideoExperienceAggregates(videoExperiences) {
        const result = {
            upperBoundAggregates: this._calculateVideoSummaryAggregates(
                videoExperiences.map(videoExperience => videoExperience.upperBound)),
            lowerBoundAggregates: this._calculateVideoSummaryAggregates(
                videoExperiences.map(videoExperience => videoExperience.lowerBound))
        };

        if (result.upperBoundAggregates || result.lowerBoundAggregates) {
            return result;
        }
    }

    /**
     * If multiple PeerConnection 'connected' states were pressent that generaly means there were disconnects present
     * as well.
     *
     * @param {*} pcData
     */
    _calculateReconnects(pcData) {
        const { connectionStates = [] } = pcData;

        const connectedStates = connectionStates.filter(connectionState => connectionState.state === 'connected');

        // We substract one because the first 'connected' state is not a reconnect.
        const reconnects = connectedStates.length > 0 ? connectedStates.length - 1 : 0;

        return reconnects;
    }

    /**
     * Check the connection timeline for 'failed' states.
     *
     * @param {*} pcData
     */
    _didPcConnectionFail(pcData) {
        const { connectionStates = [] } = pcData;

        return connectionStates.filter(connectionState => connectionState.state === 'failed').length > 0;
    }

    /**
     *
     * @param {*} extractedData - Data extracted by the QualityStatsCollector.
     */
    calculateAggregates(extractedData) {
        const resultMap = {};

        // Go through each peer connection and compute aggregates.
        Object.keys(extractedData).forEach(pc => {
            const pcData = extractedData[pc];

            resultMap[pc] = {
                isP2P: pcData.isP2P,
                usesRelay: pcData.usesRelay,
                dtlsErrors: pcData.dtlsErrors,
                dtlsFailure: pcData.dtlsFailure,
                sdpCreateFailure: pcData.sdpCreateFailure,
                sdpSetFailure: pcData.sdpSetFailure,
                lastIceFailure: pcData.lastIceFailure,
                lastIceDisconnect: pcData.lastIceDisconnect,
                candidatePairData: pcData.candidatePairData
            };

            const pcResults = resultMap[pc];
            const pcVideoExperienceResults
                = this._calculateVideoExperienceAggregates(pcData.inboundVideoExperiences);

            pcResults.tracks = this._calculateTrackStats(pcData);
            pcResults.trackAggregates = this._calculateTrackAggregates(pcData);
            pcResults.transportAggregates = this._calculateTransportAggregates(pcData);
            pcResults.iceReconnects = this._calculateReconnects(pcData);
            pcResults.pcSessionDurationMs = this._calculateSessionDurationMs(pcData);
            pcResults.connectionFailed = this._didPcConnectionFail(pcData);

            if (pcVideoExperienceResults) {
                pcResults.inboundVideoExperience = pcVideoExperienceResults;
            }
        });

        return resultMap;
    }
}

module.exports = StatsAggregator;
