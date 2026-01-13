export class Timer {
    count: number = 0;
    promise: Promise<void>
    resolve: (value: void | PromiseLike<void>) => void
    timer: any
    
    constructor(count: number) {
        if (count <= 0) {
            count = 0;
        }
        this.count = count;
        this.resolve = () => {}
        this.promise = new Promise((resolve) => {
            this.resolve = resolve;
        });
    }

    start() {
        this.timer = setInterval(() => {
            this.count --;
            if(this.count === 0) {
                this.resolve();
                clearInterval(this.timer);
                this.timer = 0;
            }
        }, 1000);
    }

    stop() {
        clearInterval(this.timer);
        this.timer = 0;
        this.resolve();
    }

    wait() : Promise<void> {
        return this.promise;
    }

    isComplete() : boolean {
        return this.count === 0;
    }

    getRemaining(): number {
        return this.count;
    }
}

export class BlockTimer {
    duration: number = 0;
    promise: Promise<void>
    resolve: (value: void | PromiseLike<void>) => void
    reject: (reason?: any) => void
    timer: any
    lastTimestamp: number = 0
    provider: any
    
    constructor(provider: any, duration: number) {
        if (duration <= 0) {
            duration = 0;
        }
        this.provider = provider;
        this.duration = duration;
        this.resolve = () => {}
        this.reject = () => {}
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    async start() {
        this.lastTimestamp = await this.getCurrentBlockTimestamp();

        this.timer = setInterval(() => {
            this.getCurrentBlockTimestamp()
            .then(currentTimestamp => {

                const time = currentTimestamp - this.lastTimestamp;
                
                if(time > 0) {
                    this.lastTimestamp = currentTimestamp;
                    this.duration = this.duration - time;
                }
                
                if(this.duration === 0) {
                    this.resolve();
                    clearInterval(this.timer);
                    this.timer = 0;
                }
            }).catch(this.reject);
        }, 1000);
    }

    stop() {
        clearInterval(this.timer);
        this.timer = 0;
        this.resolve();
    }

    wait() : Promise<void> {
        return this.promise;
    }

    isComplete() : boolean {
        return this.duration === 0;
    }

    getRemaining(): number {
        return this.duration;
    }
    
    private async getCurrentBlockTimestamp() : Promise<number> {
        const block = await this.provider.getBlock('latest');
        return block.timestamp;
    }

}