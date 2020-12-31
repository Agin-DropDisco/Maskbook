import { useCallback, useEffect, useMemo, useState } from 'react'
import BigNumber from 'bignumber.js'
import { useAccount } from './useAccount'
import { useERC20TokenContract } from '../contracts/useERC20TokenContract'
import { useTransactionReceipt } from './useTransaction'
import { useERC20TokenBalance } from './useERC20TokenBalance'

export enum TransferStateType {
    UNKNOWN,
    INSUFFICIENT_BALANCE,
    NOT_TRANSFERRED,
    PENDING,
    TRANSFERRED,
}

export function useERC20TokenTransferCallback(address: string, amount?: string, recipient?: string) {
    const account = useAccount()
    const erc20Contract = useERC20TokenContract(address)
    const { value: balance, retry: revalidateBalance } = useERC20TokenBalance(address)

    const [transferHash, setTransferHash] = useState('')
    const receipt = useTransactionReceipt(transferHash)

    const transferStateType: TransferStateType = useMemo(() => {
        if (receipt?.blockHash) return TransferStateType.TRANSFERRED
        if (!amount || !balance) return TransferStateType.UNKNOWN
        if (new BigNumber(amount).isGreaterThan(new BigNumber(balance))) return TransferStateType.INSUFFICIENT_BALANCE
        if (transferHash && !receipt?.blockHash) return TransferStateType.PENDING
        return TransferStateType.NOT_TRANSFERRED
    }, [amount, balance, transferHash, receipt?.blockHash])

    const transferCallback = useCallback(async () => {
        if (transferStateType !== TransferStateType.NOT_TRANSFERRED) return
        if (!account || !recipient || !erc20Contract) return
        if (!amount || new BigNumber(amount).isZero()) return

        const estimatedGas = await erc20Contract.methods.transfer(recipient, amount).estimateGas({
            from: account,
            to: erc20Contract.options.address,
        })

        return new Promise<string>((resolve, reject) => {
            erc20Contract.methods.transfer(recipient, amount).send(
                {
                    gas: estimatedGas,
                    from: account,
                    to: erc20Contract.options.address,
                },
                (error, hash) => {
                    if (error) reject(error)
                    else {
                        resolve(hash)
                        setTransferHash(hash)
                    }
                },
            )
        })
    }, [transferStateType, account, address, amount, recipient])

    const resetCallback = useCallback(() => {
        setTransferHash('')
        revalidateBalance()
    }, [])

    // reset transfer state
    useEffect(() => {
        setTransferHash('')
    }, [address, amount, recipient])

    // revalidate balance if tx hash was cleaned
    useEffect(() => {
        if (!transferHash) revalidateBalance()
    }, [transferHash])

    return [
        {
            type: transferStateType,
        },
        transferCallback,
        resetCallback,
    ] as const
}
